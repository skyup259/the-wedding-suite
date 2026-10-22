import { ObjectId } from 'mongodb';
import { DateTime } from 'luxon';
import type { AuthSnapshot } from '../auth/auth.types.js';
import type { InvitationRecord } from '../invitations/invitations.types.js';
import type { InvitationService } from '../invitations/invitations.service.js';
import { digest } from '../auth/auth.service.js';
import type { EmailVault, Mail } from '../../infrastructure/email.js';
import { HttpError } from '../../middleware/errors.js';
import type {
  BatchRecord,
  CampaignStore,
  CampaignUnit,
  CampaignTransport,
  DispatchRecord,
  DeliveryReceipt,
  QuotaRecord,
} from './campaigns.types.js';
export const retryWindow = 23 * 3600000;
const missing = () =>
  new HttpError(404, 'NOT_FOUND', 'Email batch or dispatch not found.');
export const mailHash = (mail: Pick<Mail, 'subject' | 'text'>) =>
  digest(JSON.stringify([mail.subject, mail.text]));
export const contentFingerprint = (i: InvitationRecord) =>
  digest(
    JSON.stringify([
      i.familyDisplayName,
      i.contactName,
      i.phone,
      i.email ?? '',
      i.eventIds.map(String),
      i.tokenVersion,
    ]),
  );
export function retryAllowed(j: DispatchRecord, now: Date) {
  return Boolean(
    j.status === 'failed' &&
    j.attempts < 8 &&
    j.retryable &&
    j.payload &&
    j.firstAttemptAt &&
    +now - +j.firstAttemptAt < retryWindow,
  );
}
export function safeDispatch(j: DispatchRecord, now: Date) {
  return {
    id: String(j._id),
    invitationId: String(j.invitationId),
    batchId: String(j.batchId),
    kind: j.kind,
    familyDisplayName: j.familyDisplayName,
    status: j.status,
    delivery: j.delivery,
    revision: j.revision,
    attempts: j.attempts,
    errorCode: j.errorCode,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    canRetry: retryAllowed(j, now),
  };
}
const rank: Record<string, number> = {
  pending: 0,
  accepted: 1,
  delayed: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
  complained: 6,
};
export function applyReceipt(j: DispatchRecord, r: DeliveryReceipt) {
  const delivery = (
    {
      'email.sent': 'accepted',
      'email.delivery_delayed': 'delayed',
      'email.delivered': 'delivered',
      'email.failed': 'failed',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
    } as const
  )[r.type as 'email.sent'];
  if (delivery && rank[delivery]! > rank[j.delivery]!) {
    j.delivery = delivery;
    j.revision++;
    j.updatedAt = r.receivedAt;
  }
}
export class CampaignService {
  constructor(
    public store: CampaignStore,
    private links: InvitationService,
    private vault: EmailVault,
    public mode: 'outbox' | 'resend',
    private allowed: string[] | null = null,
    public transport?: CampaignTransport,
    private now = () => new Date(),
  ) {}
  async ready() {
    if (!(await this.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Apply the family email migration before using email batches.',
      );
  }
  private async quota(u: CampaignUnit): Promise<QuotaRecord> {
    const existing = await u.quota(),
      timezone = existing?.timezone ?? u.wedding.timezone,
      day = DateTime.fromJSDate(this.now()).setZone(timezone).toISODate()!;
    if (existing && day < existing.day)
      throw new HttpError(
        503,
        'CLOCK_UNAVAILABLE',
        'Email allowance is temporarily unavailable.',
      );
    return existing?.day === day
      ? existing
      : { _id: u.wedding._id, timezone, day, first: 0 };
  }
  private eligible(u: CampaignUnit, i: InvitationRecord | null) {
    if (!i || i.archivedAt) throw missing();
    if (u.wedding.publicationStatus !== 'published')
      throw new HttpError(
        409,
        'WEDDING_UNPUBLISHED',
        'Publish the wedding website before preparing email.',
      );
    if (!i.email)
      throw new HttpError(
        422,
        'EMAIL_REQUIRED',
        'Add a valid contact email to every selected family.',
      );
    if (
      this.mode === 'resend' &&
      this.allowed &&
      !this.allowed.includes(i.email)
    )
      throw new HttpError(
        422,
        'RECIPIENT_NOT_ALLOWED',
        'A selected recipient is outside the configured test allowlist.',
      );
    if (
      !i.eventIds.some((id) =>
        u.events.some((e) => e._id.equals(id) && !e.archivedAt),
      )
    )
      throw new HttpError(
        422,
        'INVALID_EVENT_SELECTION',
        'Update the family’s active ceremony selection before emailing.',
      );
    return i;
  }
  private async safeBatch(u: CampaignUnit, b: BatchRecord, preview = false) {
    const q = await this.quota(u),
      jobs = await u.dispatches(b._id);
    return {
      id: String(b._id),
      revision: b.revision,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      expiresAt: b.expiresAt.toISOString(),
      mode: b.mode,
      quota: {
        day: q.day,
        timezone: q.timezone,
        firstRemaining: Math.max(0, 25 - q.first),
      },
      items: b.items.map((item) => ({
        invitationId: String(item.invitationId),
        kind: item.kind,
        ...(preview &&
        b.status === 'preview' &&
        item.payload &&
        b.expiresAt > this.now()
          ? this.vault.open(item.payload, String(item.dispatchId))
          : {}),
      })),
      dispatches: jobs.map((j) => safeDispatch(j, this.now())),
    };
  }
  async preview(actor: AuthSnapshot, ids: ObjectId[], requestId: string) {
    await this.ready();
    const id = new ObjectId();
    return this.store.transaction(actor.user.weddingId, actor, async (u) => {
      const q = await this.quota(u),
        b: BatchRecord = {
          _id: id,
          weddingId: u.wedding._id,
          createdBy: actor.user._id,
          revision: 1,
          status: 'preview',
          createdAt: this.now(),
          expiresAt: new Date(+this.now() + 15 * 60000),
          mode: this.mode,
          weddingRevision: u.wedding.revision,
          timezone: q.timezone,
          day: q.day,
          items: [],
        };
      if (ids.length > 25 - q.first)
        throw new HttpError(
          409,
          'DAILY_EMAIL_LIMIT',
          'This batch exceeds the remaining daily allowance.',
        );
      for (const invitationId of ids) {
        const i = this.eligible(u, await u.invitation(invitationId));
        if ((i.emailSequence ?? 0) > 0)
          throw new HttpError(
            409,
            'RESENDS_DISABLED',
            'This family already has an email dispatch. Explicit resends are disabled; inspect or retry its original dispatch.',
          );
        const share = this.links.shareContext({
            wedding: u.wedding,
            events: u.events,
            invitation: i,
          }),
          dispatchId = new ObjectId();
        const mail = {
          to: i.email!,
          subject:
            `Wedding invitation · ${u.wedding.couple.partner1Name} & ${u.wedding.couple.partner2Name}`
              .replace(/[\r\n]/g, ' ')
              .slice(0, 200),
          text: share.message,
        };
        b.items.push({
          invitationId,
          dispatchId,
          revision: i.revision,
          sequence: 1,
          kind: 'first',
          payload: this.vault.seal(mail, String(dispatchId)),
          fingerprint: contentFingerprint(i),
        });
      }
      await u.saveBatch(b);
      await u.audit('email_batch.previewed', b._id, this.now(), requestId);
      return this.safeBatch(u, b, true);
    });
  }
  async get(actor: AuthSnapshot, id: ObjectId) {
    await this.ready();
    return this.store.transaction(actor.user.weddingId, actor, async (u) => {
      const b = await u.batch(id);
      if (!b) throw missing();
      return this.safeBatch(u, b, true);
    });
  }
  async list(actor: AuthSnapshot, after?: ObjectId) {
    await this.ready();
    const records = await this.store.batches(actor.user.weddingId, after),
      page = records.slice(0, 20);
    const items = await this.store.transaction(
      actor.user.weddingId,
      actor,
      async (u) => {
        const out = [];
        for (const b of page) out.push(await this.safeBatch(u, b));
        return out;
      },
    );
    return {
      items,
      hasMore: records.length > 20,
      nextCursor: records.length > 20 ? String(page.at(-1)!._id) : null,
    };
  }
  async confirm(
    actor: AuthSnapshot,
    id: ObjectId,
    revision: number,
    requestId: string,
  ) {
    await this.ready();
    return this.store.transaction(actor.user.weddingId, actor, async (u) => {
      const b = await u.batch(id);
      if (!b) throw missing();
      // Authorization precedes replay; confirmed batches never reserve or enqueue twice.
      if (b.status === 'confirmed') return this.safeBatch(u, b);
      if (b.revision !== revision)
        throw new HttpError(
          412,
          'REVISION_CONFLICT',
          'Reload the batch before confirming.',
        );
      const q = await this.quota(u);
      if (
        b.status !== 'preview' ||
        b.expiresAt <= this.now() ||
        b.day !== q.day ||
        b.timezone !== q.timezone ||
        b.mode !== this.mode ||
        b.weddingRevision !== u.wedding.revision
      )
        throw new HttpError(
          409,
          'PREVIEW_EXPIRED',
          'The preview expired or wedding content changed. Prepare a fresh preview.',
        );
      if (q.first + b.items.length > 25)
        throw new HttpError(
          409,
          'DAILY_EMAIL_LIMIT',
          'Another batch used the daily allowance. Prepare a smaller batch.',
        );
      for (const item of b.items) {
        const i = this.eligible(u, await u.invitation(item.invitationId));
        if (
          i.revision !== item.revision ||
          contentFingerprint(i) !== item.fingerprint ||
          (i.emailSequence ?? 0) > 0 ||
          !item.payload
        )
          throw new HttpError(
            412,
            'REVISION_CONFLICT',
            'A selected family changed or was already queued. Prepare a fresh preview.',
          );
        const mail = this.vault.open(item.payload, String(item.dispatchId));
        i.emailSequence = 1;
        i.emailLastQueuedAt = this.now();
        i.revision++;
        i.updatedAt = this.now();
        i.updatedBy = actor.user._id;
        await u.saveInvitation(i);
        const j: DispatchRecord = {
          _id: item.dispatchId,
          weddingId: b.weddingId,
          type: 'invitation_email',
          invitationId: i._id,
          batchId: b._id,
          sequence: 1,
          kind: 'first',
          familyDisplayName: i.familyDisplayName,
          revision: 1,
          invitationRevision: i.revision,
          weddingRevision: b.weddingRevision,
          fingerprint: item.fingerprint,
          payload: item.payload,
          recipientHash: digest(mail.to),
          messageHash: mailHash(mail),
          idempotencyKey: `family-email/${item.dispatchId}`,
          mode: b.mode,
          status: 'queued',
          delivery: 'pending',
          providerId: null,
          attempts: 0,
          nextRunAt: this.now(),
          leaseOwner: null,
          leaseVersion: 0,
          leaseUntil: null,
          firstAttemptAt: null,
          createdAt: this.now(),
          updatedAt: this.now(),
          errorCode: null,
          retryable: false,
        };
        await u.saveDispatch(j);
        item.payload = null;
      }
      q.first += b.items.length;
      await u.saveQuota(q);
      b.status = 'confirmed';
      b.revision++;
      await u.saveBatch(b);
      await u.audit('email_batch.confirmed', b._id, this.now(), requestId);
      return this.safeBatch(u, b);
    });
  }
  async retry(
    actor: AuthSnapshot,
    id: ObjectId,
    revision: number,
    requestId: string,
  ) {
    await this.ready();
    return this.store.transaction(actor.user.weddingId, actor, async (u) => {
      const j = await u.dispatch(id);
      if (!j) throw missing();
      if (j.revision !== revision)
        throw new HttpError(
          412,
          'REVISION_CONFLICT',
          'Reload the email status before retrying.',
        );
      if (!retryAllowed(j, this.now()))
        throw new HttpError(
          409,
          'RECONCILIATION_REQUIRED',
          'This dispatch cannot be retried safely. Check its provider outcome.',
        );
      if (j.mode !== this.mode)
        throw new HttpError(
          409,
          'EMAIL_MODE_CHANGED',
          'Restore the original email mode before retrying this dispatch.',
        );
      const i = this.eligible(u, await u.invitation(j.invitationId));
      if (
        i.revision !== j.invitationRevision ||
        contentFingerprint(i) !== j.fingerprint ||
        u.wedding.revision !== j.weddingRevision
      )
        throw new HttpError(
          409,
          'MESSAGE_CHANGED',
          'The reviewed content changed. The original dispatch cannot be resent.',
        );
      j.status = 'queued';
      j.nextRunAt = this.now();
      j.updatedAt = this.now();
      j.revision++;
      j.errorCode = null;
      j.retryable = false;
      await u.saveDispatch(j);
      await u.audit('invitation_email.retry', j._id, this.now(), requestId);
      return safeDispatch(j, this.now());
    });
  }
  async reconcile(
    actor: AuthSnapshot,
    id: ObjectId,
    revision: number,
    providerId: string,
    requestId: string,
  ) {
    await this.ready();
    const original = await this.store.transaction(
      actor.user.weddingId,
      actor,
      async (u) => {
        const j = await u.dispatch(id);
        if (!j) throw missing();
        if (j.status !== 'unknown' || j.revision !== revision)
          throw new HttpError(
            409,
            'RECONCILIATION_REQUIRED',
            'Only a current unknown dispatch can be reconciled.',
          );
        return j;
      },
    );
    if (!this.transport?.retrieve || original.mode !== 'resend')
      throw new HttpError(
        503,
        'PROVIDER_UNAVAILABLE',
        'Provider lookup is unavailable.',
      );
    let email: Awaited<ReturnType<NonNullable<CampaignTransport['retrieve']>>>;
    try {
      email = await this.transport.retrieve(providerId);
    } catch {
      throw new HttpError(
        502,
        'PROVIDER_UNAVAILABLE',
        'Provider lookup failed. No dispatch was changed.',
      );
    }
    if (
      email.to.length !== 1 ||
      digest(email.to[0]!.toLowerCase()) !== original.recipientHash ||
      mailHash(email) !== original.messageHash ||
      !original.firstAttemptAt ||
      !Number.isFinite(+email.createdAt) ||
      +email.createdAt < +original.firstAttemptAt - 60000 ||
      +email.createdAt > +original.firstAttemptAt + retryWindow
    )
      throw new HttpError(
        409,
        'PROVIDER_MISMATCH',
        'That provider email does not match this reviewed dispatch.',
      );
    return this.store.transaction(actor.user.weddingId, actor, async (u) => {
      const j = await u.dispatch(id);
      if (!j || j.revision !== revision || j.status !== 'unknown')
        throw new HttpError(
          412,
          'REVISION_CONFLICT',
          'Reload the dispatch before reconciling.',
        );
      j.providerId = providerId;
      j.status = 'accepted';
      j.delivery = 'accepted';
      j.payload = null;
      j.retryable = false;
      j.errorCode = null;
      j.revision++;
      j.updatedAt = this.now();
      applyReceipt(j, {
        _id: 'lookup',
        providerId,
        type: `email.${email.lastEvent}`,
        occurredAt: email.createdAt,
        receivedAt: this.now(),
      });
      for (const r of await u.receipts(providerId)) applyReceipt(j, r);
      await this.markSent(u, j);
      await u.saveDispatch(j);
      await u.audit('invitation_email.reconciled', id, this.now(), requestId);
      return safeDispatch(j, this.now());
    });
  }
  async markSent(u: CampaignUnit, j: DispatchRecord) {
    const i = await u.invitation(j.invitationId);
    // Preserve intervening explicit team edits/status changes, including archive/rotation.
    if (
      i &&
      !i.archivedAt &&
      i.revision === j.invitationRevision &&
      i.sentStatus === 'not_sent'
    ) {
      i.sentStatus = 'sent';
      i.sentAt = this.now();
      i.revision++;
      i.updatedAt = this.now();
      await u.saveInvitation(i);
    }
  }
}
