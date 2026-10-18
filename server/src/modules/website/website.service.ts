import { ObjectId } from 'mongodb';
import { DateTime } from 'luxon';
import type { z } from 'zod';
import { themes, eventInputSchema } from '@wedding-suite/shared/website';
import type {
  weddingPatchSchema,
  EventInput,
  WeddingEvent,
  GuestModel,
  Wedding,
} from '@wedding-suite/shared/website';
import type { AuthSnapshot, WeddingRecord } from '../auth/auth.types.js';
import { photoExpiry, weddingSlug } from '../auth/auth.service.js';
import { HttpError } from '../../middleware/errors.js';
import { objectId } from '../access/access.service.js';
import type {
  WebsiteStore,
  WebsiteSnapshot,
  EventRecord,
} from './website.types.js';
export const safeWedding = (w: WeddingRecord): Wedding => ({
  id: w._id.toHexString(),
  couple: {
    partner1Name: w.couple.partner1Name,
    partner2Name: w.couple.partner2Name,
  },
  mainDate: w.mainDate,
  timezone: w.timezone,
  website: {
    themeId: w.website.themeId,
    intro: w.website.intro,
    welcomeMessage: w.website.welcomeMessage,
    accentColor: w.website.accentColor,
    coverPhotoId: null,
  },
  location: w.location,
  slug: w.slug,
  publicationStatus: w.publicationStatus,
  revision: w.revision,
  photoExpiryAt: w.photoExpiryAt.toISOString(),
  updatedAt: w.updatedAt.toISOString(),
  latestAnnouncement: w.latestAnnouncement
    ? {
        message: w.latestAnnouncement.message,
        updatedAt: w.latestAnnouncement.updatedAt.toISOString(),
      }
    : null,
});
export const safeEvent = (e: EventRecord): WeddingEvent => ({
  id: e._id.toHexString(),
  name: e.name,
  description: e.description,
  startAt: e.startAt.toISOString(),
  endAt: e.endAt?.toISOString() ?? null,
  venue: {
    name: e.venue.name,
    address: e.venue.address,
    mapUrl: e.venue.mapUrl,
  },
  contacts: e.contacts.map((c) => ({ name: c.name, phone: c.phone })),
  dressCode: e.dressCode,
  instructions: e.instructions,
  status: e.status,
  sortOrder: e.sortOrder,
  stream: null,
  revision: e.revision,
  archivedAt: e.archivedAt?.toISOString() ?? null,
  updatedAt: e.updatedAt.toISOString(),
});
function conflict(current: number, expected: number) {
  if (current !== expected)
    throw new HttpError(
      412,
      'REVISION_CONFLICT',
      'This record changed. Reload the latest version before saving.',
    );
}
function validatePublic(w: WeddingRecord, events: EventRecord[]) {
  const active = events.filter((e) => !e.archivedAt);
  if (!active.length)
    throw new HttpError(
      422,
      'PUBLICATION_INCOMPLETE',
      'Add at least one ceremony before publishing.',
    );
  if (
    active.some(
      (e) => !e.venue.name || !e.venue.address || e.contacts.length < 1,
    )
  )
    throw new HttpError(
      422,
      'PUBLICATION_INCOMPLETE',
      'Every published ceremony needs a venue, address and one or two contacts.',
    );
  if (!w.couple.partner1Name || !w.couple.partner2Name)
    throw new HttpError(
      422,
      'PUBLICATION_INCOMPLETE',
      'Enter both partner names before publishing.',
    );
}
export class WebsiteService {
  readonly themes = themes;
  constructor(
    public store: WebsiteStore,
    public now: () => Date = () => new Date(),
  ) {}
  async ready() {
    if (!(await this.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'This wedding website is temporarily unavailable. Please try again later.',
      );
  }
  async read(actor: AuthSnapshot) {
    await this.ready();
    const s = await this.store.read(actor.user.weddingId);
    if (!s) throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
    return s;
  }
  private advance(w: WeddingRecord, actor: AuthSnapshot) {
    return {
      ...w,
      revision: w.revision + 1,
      updatedAt: this.now(),
      updatedBy: actor.user._id,
    };
  }
  guest(s: WebsiteSnapshot): GuestModel {
    const w = safeWedding(s.wedding),
      events = s.events
        .filter((e) => !e.archivedAt)
        .sort(
          (a, b) =>
            a.startAt.getTime() - b.startAt.getTime() ||
            a.sortOrder - b.sortOrder ||
            a._id.toHexString().localeCompare(b._id.toHexString()),
        )
        .map((e) => {
          const { revision, archivedAt, ...safe } = safeEvent(e);
          void revision;
          void archivedAt;
          return safe;
        }),
      now = this.now();
    return {
      wedding: {
        couple: w.couple,
        mainDate: w.mainDate,
        timezone: w.timezone,
        slug: w.slug,
        website: w.website,
        latestAnnouncement: w.latestAnnouncement,
      },
      events,
      today: {
        active: events
          .filter((e) => e.status === 'in_progress')
          .map((e) => e.id),
        next:
          events.find(
            (e) =>
              e.status === 'not_started' &&
              Date.parse(e.startAt) >= now.getTime(),
          )?.id ?? null,
        overdue: events
          .filter(
            (e) =>
              e.status === 'not_started' &&
              Date.parse(e.startAt) < now.getTime(),
          )
          .map((e) => e.id),
        localDate: DateTime.fromJSDate(now, { zone: w.timezone }).toISODate()!,
      },
      updatedAt: w.updatedAt,
    };
  }
  async public(slug: string) {
    await this.ready();
    if (slug.length > 160)
      throw new HttpError(404, 'NOT_FOUND', 'Wedding website not available.');
    const s = await this.store.publicRead(slug);
    if (!s)
      throw new HttpError(404, 'NOT_FOUND', 'Wedding website not available.');
    return this.guest(s);
  }
  async patch(
    actor: AuthSnapshot,
    input: z.infer<typeof weddingPatchSchema>,
    expected: number,
    requestId = 'website-service',
  ) {
    await this.ready();
    return safeWedding(
      (
        await this.store.mutate(
          actor,
          (s) => {
            conflict(s.wedding.revision, expected);
            const w = this.advance(s.wedding, actor);
            if (input.couple !== undefined) w.couple = input.couple;
            if (input.mainDate !== undefined) w.mainDate = input.mainDate;
            if (input.timezone !== undefined) w.timezone = input.timezone;
            if (input.website !== undefined) w.website = input.website;
            if (input.location !== undefined) w.location = input.location;
            if (input.mainDate || input.timezone) {
              const expiry = photoExpiry(w.mainDate, w.timezone);
              if (
                expiry > s.wedding.photoExpiryAt &&
                ['running', 'complete', 'failed'].includes(
                  s.wedding.mediaCleanup.state,
                )
              )
                throw new HttpError(
                  409,
                  'MEDIA_CLEANUP_IN_PROGRESS',
                  'Photo cleanup has begun; changing this date cannot extend access.',
                );
              if (expiry.getTime() !== w.photoExpiryAt.getTime()) {
                w.photoExpiryAt = expiry;
                w.retentionVersion++;
              }
            }
            if (
              !w.slugLockedAt &&
              ((input.mainDate !== undefined &&
                input.mainDate !== s.wedding.mainDate) ||
                (input.couple !== undefined &&
                  (input.couple.partner1Name !==
                    s.wedding.couple.partner1Name ||
                    input.couple.partner2Name !==
                      s.wedding.couple.partner2Name)))
            )
              w.slug = weddingSlug({
                couple: w.couple,
                mainDate: w.mainDate,
                timezone: w.timezone,
                themeId: w.website.themeId,
              });
            if (w.publicationStatus === 'published')
              validatePublic(w, s.events);
            return { wedding: w, action: 'wedding_updated', entityId: w._id };
          },
          undefined,
          requestId,
        )
      ).wedding,
    );
  }
  async publish(
    actor: AuthSnapshot,
    expected: number,
    published: boolean,
    requestId = 'website-service',
  ) {
    await this.ready();
    return safeWedding(
      (
        await this.store.mutate(
          actor,
          (s) => {
            conflict(s.wedding.revision, expected);
            if (published) validatePublic(s.wedding, s.events);
            const w = this.advance(s.wedding, actor);
            w.publicationStatus = published ? 'published' : 'draft';
            if (published) {
              w.slugLockedAt ??= this.now();
              w.publishedAt ??= this.now();
            }
            return {
              wedding: w,
              action: published ? 'wedding_published' : 'wedding_unpublished',
              entityId: w._id,
            };
          },
          undefined,
          requestId,
        )
      ).wedding,
    );
  }
  async announcement(
    actor: AuthSnapshot,
    message: string | null,
    expected: number,
    requestId = 'website-service',
  ) {
    await this.ready();
    return safeWedding(
      (
        await this.store.mutate(
          actor,
          (s) => {
            conflict(s.wedding.revision, expected);
            const w = this.advance(s.wedding, actor);
            w.latestAnnouncement = message
              ? { message, updatedAt: this.now(), updatedBy: actor.user._id }
              : null;
            return {
              wedding: w,
              action: message ? 'announcement_updated' : 'announcement_removed',
              entityId: w._id,
            };
          },
          undefined,
          requestId,
        )
      ).wedding,
    );
  }
  async event(
    actor: AuthSnapshot,
    input: { [K in keyof EventInput]?: EventInput[K] | undefined },
    id?: string,
    expected?: number,
    requestId = 'website-service',
  ) {
    await this.ready();
    const oid = id ? objectId(id) : new ObjectId();
    return safeEvent(
      (
        await this.store.mutate(
          actor,
          (s) => {
            const old = id
              ? s.events.find((e) => e._id.equals(oid) && !e.archivedAt)
              : undefined;
            if (id && !old)
              throw new HttpError(404, 'NOT_FOUND', 'Ceremony not found.');
            if (old) conflict(old.revision, expected!);
            const previous = old ? safeEvent(old) : {};
            const merged = eventInputSchema.parse(
              Object.fromEntries(
                Object.keys(eventInputSchema.shape).map((key) => [
                  key,
                  key in input
                    ? input[key as keyof EventInput]
                    : previous[key as keyof typeof previous],
                ]),
              ),
            );
            const now = this.now(),
              event: EventRecord = {
                ...merged,
                _id: oid,
                weddingId: s.wedding._id,
                startAt: new Date(merged.startAt),
                endAt: merged.endAt ? new Date(merged.endAt) : null,
                createdAt: old?.createdAt ?? now,
                updatedAt: now,
                createdBy: old?.createdBy ?? actor.user._id,
                updatedBy: actor.user._id,
                revision: (old?.revision ?? 0) + 1,
                schemaVersion: 1,
                archivedAt: null,
              };
            const w = this.advance(s.wedding, actor);
            if (w.publicationStatus === 'published')
              validatePublic(w, [
                ...s.events.filter((e) => !e._id.equals(oid)),
                event,
              ]);
            return {
              wedding: w,
              event,
              action: old ? 'event_updated' : 'event_created',
              entityId: oid,
            };
          },
          undefined,
          requestId,
        )
      ).event!,
    );
  }
  async archive(
    actor: AuthSnapshot,
    id: string,
    expected: number,
    confirmed: boolean,
    requestId = 'website-service',
  ) {
    await this.ready();
    const oid = objectId(id);
    return safeEvent(
      (
        await this.store.mutate(
          actor,
          (s) => {
            const old = s.events.find(
              (e) => e._id.equals(oid) && !e.archivedAt,
            );
            if (!old)
              throw new HttpError(404, 'NOT_FOUND', 'Ceremony not found.');
            conflict(old.revision, expected);
            if (Object.values(s.references).some((n) => n > 0) && !confirmed) {
              const error = new HttpError(
                409,
                'RESOURCE_REFERENCED',
                'This ceremony is referenced. Confirm archiving; linked invitation highlights will change.',
              );
              error.fields = Object.entries(s.references)
                .filter(([, n]) => n > 0)
                .map(([path, n]) => ({
                  path,
                  code: 'REFERENCE_COUNT',
                  message: String(n),
                }));
              throw error;
            }
            const event = {
                ...old,
                archivedAt: this.now(),
                updatedAt: this.now(),
                updatedBy: actor.user._id,
                revision: old.revision + 1,
              },
              w = this.advance(s.wedding, actor);
            if (w.publicationStatus === 'published')
              validatePublic(
                w,
                s.events.filter((e) => !e._id.equals(oid)),
              );
            return {
              wedding: w,
              event,
              action: 'event_archived',
              entityId: oid,
            };
          },
          oid,
          requestId,
        )
      ).event!,
    );
  }
}
