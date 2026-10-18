import { MongoServerError } from 'mongodb';
import type { Db, MongoClient, ClientSession, ObjectId } from 'mongodb';
import type {
  AuthSnapshot,
  UserRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
import type {
  WebsiteStore,
  WebsiteSnapshot,
  WebsiteChange,
  EventRecord,
} from './website.types.js';
import { HttpError } from '../../middleware/errors.js';
export const WEBSITE_MIGRATION = '003-wedding-events';
export class MongoWebsiteStore implements WebsiteStore {
  constructor(
    private client: MongoClient,
    private db: Db,
  ) {}
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string }>('schemaMigrations')
        .findOne({ _id: WEBSITE_MIGRATION }),
    );
  }
  private async snapshot(
    wedding: WeddingRecord,
    session?: ClientSession,
  ): Promise<WebsiteSnapshot> {
    const events = await this.db
      .collection<EventRecord>('events')
      .find({ weddingId: wedding._id }, { ...(session ? { session } : {}) })
      .sort({ startAt: 1, sortOrder: 1, _id: 1 })
      .toArray();
    return { wedding, events, references: {} };
  }
  async read(weddingId: ObjectId) {
    const wedding = await this.db
      .collection<WeddingRecord>('weddings')
      .findOne({ _id: weddingId });
    return wedding ? this.snapshot(wedding) : null;
  }
  async publicRead(slug: string) {
    const tx = this.client.startSession();
    try {
      return await tx.withTransaction(
        async () => {
          const wedding = await this.db
            .collection<WeddingRecord>('weddings')
            .findOne({ slug, publicationStatus: 'published' }, { session: tx });
          return wedding ? this.snapshot(wedding, tx) : null;
        },
        { readConcern: { level: 'snapshot' } },
      );
    } finally {
      await tx.endSession();
    }
  }
  async mutate(
    actor: AuthSnapshot,
    work: (snapshot: WebsiteSnapshot) => WebsiteChange,
    referencedEvent?: ObjectId,
    requestId = 'website-service',
  ) {
    const tx = this.client.startSession();
    try {
      return await tx.withTransaction(async () => {
        const authority = await this.db
          .collection<UserRecord>('users')
          .updateOne(
            {
              _id: actor.user._id,
              weddingId: actor.user.weddingId,
              status: 'active',
              sessionVersion: actor.user.sessionVersion,
              role: actor.user.role,
            },
            { $inc: { accessRevision: 1 } },
            { session: tx },
          );
        if (!authority.matchedCount)
          throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
        const wedding = await this.db
          .collection<WeddingRecord>('weddings')
          .findOne({ _id: actor.user.weddingId }, { session: tx });
        if (!wedding)
          throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
        const snapshot = await this.snapshot(wedding, tx);
        if (referencedEvent) {
          for (const name of [
            'invitations',
            'tasks',
            'expenses',
            'photos',
            'photoSubmissions',
          ])
            snapshot.references[name] = await this.db
              .collection(name)
              .countDocuments(
                {
                  weddingId: wedding._id,
                  ...(name === 'invitations'
                    ? { eventIds: referencedEvent }
                    : { eventId: referencedEvent }),
                },
                { session: tx },
              );
        }
        const change = work(snapshot);
        await this.db
          .collection<WeddingRecord>('weddings')
          .replaceOne({ _id: wedding._id }, change.wedding, { session: tx });
        if (change.event)
          await this.db
            .collection<EventRecord>('events')
            .replaceOne(
              { _id: change.event._id, weddingId: wedding._id },
              change.event,
              { upsert: true, session: tx },
            );
        await this.db.collection('auditLogs').insertOne(
          {
            weddingId: wedding._id,
            actorType: 'user',
            actorId: actor.user._id,
            action: change.action,
            entityType: change.event ? 'event' : 'wedding',
            entityId: change.entityId,
            timestamp: change.wedding.updatedAt,
            requestId,
            schemaVersion: 1,
            createdAt: change.wedding.updatedAt,
            updatedAt: change.wedding.updatedAt,
          },
          { session: tx },
        );
        return change;
      });
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000)
        throw new HttpError(
          409,
          'SLUG_CONFLICT',
          'This website address is unavailable. Change a partner name before publishing.',
        );
      throw e;
    } finally {
      await tx.endSession();
    }
  }
}
