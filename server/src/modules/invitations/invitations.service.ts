import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { DateTime } from 'luxon';
import {
  invitationInputSchema,
  invitationPatchSchema,
  invitationIdSchema,
} from '@wedding-suite/shared/invitations';
import type { InvitationInput } from '@wedding-suite/shared/invitations';
import type { AuthSnapshot } from '../auth/auth.types.js';
import { digest, opaqueToken } from '../auth/auth.service.js';
import { objectId } from '../access/access.service.js';
import { WebsiteService } from '../website/website.service.js';
import { HttpError } from '../../middleware/errors.js';
import type {
  InvitationStore,
  InvitationContext,
  InvitationRecord,
  InvitationFilter,
} from './invitations.types.js';
import type { InvitationVault } from './invitations.vault.js';
const missing = () =>
  new HttpError(404, 'NOT_FOUND', 'Invitation not available.');
export function safeInvitation(c: InvitationContext) {
  const i = c.invitation!;
  return {
    id: i._id.toHexString(),
    familyDisplayName: i.familyDisplayName,
    contactName: i.contactName,
    phone: i.phone,
    ...(i.email !== undefined ? { email: i.email } : {}),
    eventIds: i.eventIds.map((id) => id.toHexString()),
    emailQueued: (i.emailSequence ?? 0) > 0,
    revision: i.revision,
    sentStatus: i.sentStatus,
    sentAt: i.sentAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    archivedEventIds: i.eventIds
      .filter((id) => !c.events.some((e) => e._id.equals(id) && !e.archivedAt))
      .map((id) => id.toHexString()),
  };
}
const querySchema = z.strictObject({
  search: z.string().trim().max(100).default(''),
  sentStatus: z.enum(['sent', 'not_sent']).optional(),
  eventId: invitationIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(2000).optional(),
});
const cursorSchema = z.strictObject({
  scope: z.string(),
  date: z.iso.datetime(),
  id: invitationIdSchema,
});
export class InvitationService {
  constructor(
    public store: InvitationStore,
    private vault: InvitationVault,
    private website: WebsiteService,
    private origin: string,
    private now = () => new Date(),
  ) {}
  async ready() {
    if (!(await this.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Family invitations are temporarily unavailable. Apply the invitation migration.',
      );
  }
  private context(i: InvitationRecord) {
    return `family-invitation:${i.weddingId}:${i._id}:${i.tokenVersion}`;
  }
  private token(i: InvitationRecord, token = opaqueToken()) {
    i.tokenHash = digest(token);
    i.tokenCiphertext = this.vault.seal(token, this.context(i));
    i.tokenKeyVersion = 1;
    return i;
  }
  private present(c: InvitationContext | null, expected?: number) {
    if (!c?.invitation || c.invitation.archivedAt) throw missing();
    if (expected !== undefined && c.invitation.revision !== expected)
      throw new HttpError(
        412,
        'REVISION_CONFLICT',
        'This family changed. Reload its latest version before saving.',
      );
    return c.invitation;
  }
  private selection(c: InvitationContext, eventIds: string[]) {
    if (
      !eventIds.every((id) =>
        c.events.some((e) => e._id.toHexString() === id && !e.archivedAt),
      )
    )
      throw new HttpError(
        422,
        'INVALID_EVENT_SELECTION',
        'Choose active ceremonies from your wedding.',
      );
  }
  async get(actor: AuthSnapshot, id: string) {
    await this.ready();
    const c = await this.store.read(actor.user.weddingId, objectId(id));
    this.present(c);
    return safeInvitation(c!);
  }
  async list(actor: AuthSnapshot, query: unknown) {
    await this.ready();
    const q = querySchema.parse(query),
      scope = digest(
        JSON.stringify([
          actor.user.weddingId.toHexString(),
          q.search,
          q.sentStatus ?? '',
          q.eventId ?? '',
          q.limit,
        ]),
      );
    const filter: InvitationFilter = {
      search: q.search,
      limit: q.limit,
      ...(q.sentStatus ? { sentStatus: q.sentStatus } : {}),
      ...(q.eventId ? { eventId: objectId(q.eventId) } : {}),
    };
    if (q.cursor) {
      try {
        const c = cursorSchema.parse(
          JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')),
        );
        if (c.scope !== scope) throw new Error('Wrong cursor scope');
        filter.after = { date: new Date(c.date), id: objectId(c.id) };
      } catch {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          'Reload the list with its current filters.',
        );
      }
    }
    const [records, summary] = await Promise.all([
      this.store.list(actor.user.weddingId, filter),
      this.store.overview(actor.user.weddingId),
    ]);
    if (!summary) throw missing();
    const hasMore = records.length > q.limit,
      page = records.slice(0, q.limit),
      last = page.at(-1);
    return {
      items: page.map((invitation) =>
        safeInvitation({ ...summary, invitation }),
      ),
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                scope,
                date: last.createdAt.toISOString(),
                id: last._id.toHexString(),
              }),
            ).toString('base64url')
          : null,
    };
  }
  async create(
    actor: AuthSnapshot,
    input: InvitationInput,
    requestId = 'invitation-service',
  ) {
    await this.ready();
    const data = invitationInputSchema.parse(input),
      id = new ObjectId();
    const c = await this.store.mutate(
      actor,
      id,
      'invitation.created',
      (c) => {
        this.selection(c, data.eventIds);
        const now = this.now();
        return this.token({
          ...data,
          _id: id,
          weddingId: c.wedding._id,
          eventIds: data.eventIds.map(objectId),
          tokenHash: '',
          tokenCiphertext: '',
          tokenVersion: 1,
          tokenKeyVersion: 1,
          sentStatus: 'not_sent',
          sentAt: null,
          archivedAt: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          createdBy: actor.user._id,
          updatedBy: actor.user._id,
          schemaVersion: 1,
        });
      },
      requestId,
    );
    return safeInvitation(c);
  }
  async change(
    actor: AuthSnapshot,
    id: string,
    expected: number,
    action: 'edit' | 'sent' | 'rotate' | 'archive',
    input: unknown,
    requestId = 'invitation-service',
  ) {
    await this.ready();
    const c = await this.store.mutate(
      actor,
      objectId(id),
      `invitation.${action}`,
      (c) => {
        const i = this.present(c, expected);
        if (action === 'edit') {
          const patch = invitationPatchSchema.parse(input),
            merged = invitationInputSchema.parse({
              familyDisplayName: i.familyDisplayName,
              contactName: i.contactName,
              phone: i.phone,
              ...(i.email !== undefined ? { email: i.email } : {}),
              eventIds: i.eventIds.map(String),
              ...patch,
            });
          // Parse only editable fields; historical archived selections may survive contact-only edits.
          if (patch.eventIds) this.selection(c, patch.eventIds);
          Object.assign(i, merged, { eventIds: merged.eventIds.map(objectId) });
        } else if (action === 'sent') {
          const status = z.enum(['sent', 'not_sent']).parse(input);
          if (status !== i.sentStatus) {
            i.sentStatus = status;
            i.sentAt = status === 'sent' ? this.now() : null;
          }
        } else if (action === 'rotate') {
          i.tokenVersion++;
          this.token(i);
        } else {
          i.archivedAt = this.now();
          i.tokenCiphertext = '';
          i.tokenVersion++;
          i.tokenHash = digest(opaqueToken());
        }
        i.revision++;
        i.updatedAt = this.now();
        i.updatedBy = actor.user._id;
        return i;
      },
      requestId,
    );
    return {
      ...safeInvitation(c),
      ...(action === 'rotate'
        ? {
            share:
              c.wedding.publicationStatus === 'published'
                ? this.shareContext(c)
                : null,
          }
        : {}),
    };
  }
  async estimates(actor: AuthSnapshot) {
    await this.ready();
    const s = await this.store.overview(actor.user.weddingId);
    if (!s) throw missing();
    return {
      kind: 'estimate' as const,
      totalFamilies: s.totalFamilies,
      sentFamilies: s.sentFamilies,
      attendees: { min: s.sentFamilies * 2, max: s.sentFamilies * 3 },
      events: s.events
        .filter((e) => !e.archivedAt)
        .map((e) => {
          const n = s.counts[e._id.toHexString()] ?? 0;
          return {
            eventId: e._id.toHexString(),
            name: e.name,
            sentFamilies: n,
            min: n * 2,
            max: n * 3,
          };
        }),
    };
  }
  async share(actor: AuthSnapshot, id: string) {
    await this.ready();
    const c = await this.store.read(actor.user.weddingId, objectId(id));
    this.present(c);
    return this.shareContext(c!);
  }
  shareContext(c: InvitationContext) {
    const i = this.present(c);
    if (c.wedding.publicationStatus !== 'published')
      throw new HttpError(
        409,
        'WEDDING_UNPUBLISHED',
        'Publish your wedding website before sharing invitations.',
      );
    let token: string;
    try {
      token = this.vault.open(i.tokenCiphertext, this.context(i));
      if (digest(token) !== i.tokenHash) throw new Error('Invalid token');
    } catch {
      throw new HttpError(
        503,
        'INVITATION_LINK_UNAVAILABLE',
        'This invitation link cannot be recovered. Check key configuration or rotate this link.',
      );
    }
    const url = `${this.origin}/w/${encodeURIComponent(c!.wedding.slug)}/invite/${token}`;
    const events = c!.events.filter(
      (e) => !e.archivedAt && i.eventIds.some((id) => id.equals(e._id)),
    );
    const lines = events.map(
      (e) =>
        `${e.name} — ${DateTime.fromJSDate(e.startAt).setZone(c!.wedding.timezone).toFormat('dd LLL yyyy, h:mm a')} (${c!.wedding.timezone})${e.venue.name ? ', ' + e.venue.name : ''}`,
    );
    const message = `Dear ${i.familyDisplayName},\nPlease join us to celebrate ${c!.wedding.couple.partner1Name} & ${c!.wedding.couple.partner2Name}.\n${lines.length ? lines.join('\n') : 'The ceremony selection has changed. Please see the full schedule.'}\nYour invitation: ${url}\nThe full wedding schedule is open to every guest.`;
    return {
      url,
      message,
      whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
    };
  }
  async publicView(slug: string, token: string) {
    await this.ready();
    if (!/^[a-f0-9]{64}$/.test(token)) throw missing();
    const c = await this.store.publicRead(slug, digest(token));
    const i = this.present(c);
    return {
      familyDisplayName: i.familyDisplayName,
      selectedEventIds: c!.events
        .filter(
          (e) => !e.archivedAt && i.eventIds.some((id) => id.equals(e._id)),
        )
        .map((e) => e._id.toHexString()),
      model: this.website.guest({ ...c!, references: {} }),
    };
  }
}
