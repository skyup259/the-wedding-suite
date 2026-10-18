import type { ClientSession, Db, MongoClient, ObjectId, Filter } from 'mongodb';
import type {
  AuthSnapshot,
  UserRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
import type {
  InvitationStore,
  InvitationRecord,
  InvitationContext,
  InvitationFilter,
} from './invitations.types.js';
import { HttpError } from '../../middleware/errors.js';
export const INVITATIONS_MIGRATION = '004-family-invitations';
export class MongoInvitationStore implements InvitationStore {
  constructor(
    private client: MongoClient,
    private db: Db,
  ) {}
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string }>('schemaMigrations')
        .findOne({ _id: INVITATIONS_MIGRATION }),
    );
  }
  private async snapshot(
    wedding: WeddingRecord,
    invitation: InvitationRecord | null,
    session: ClientSession,
  ): Promise<InvitationContext> {
    const events = await this.db
      .collection<EventRecord>('events')
      .find({ weddingId: wedding._id }, { session })
      .sort({ startAt: 1, sortOrder: 1, _id: 1 })
      .toArray();
    return { wedding, events, invitation };
  }
  private async transaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => work(session), {
        readConcern: { level: 'snapshot' },
      });
    } finally {
      await session.endSession();
    }
  }
  async read(weddingId: ObjectId, id: ObjectId) {
    return this.transaction(async (session) => {
      const wedding = await this.db
        .collection<WeddingRecord>('weddings')
        .findOne({ _id: weddingId }, { session });
      if (!wedding) return null;
      const invitation = await this.db
        .collection<InvitationRecord>('invitations')
        .findOne({ _id: id, weddingId, archivedAt: null }, { session });
      return this.snapshot(wedding, invitation, session);
    });
  }
  async list(weddingId: ObjectId, filter: InvitationFilter) {
    const query: Filter<InvitationRecord> = { weddingId, archivedAt: null };
    if (filter.sentStatus) query.sentStatus = filter.sentStatus;
    if (filter.eventId) query.eventIds = filter.eventId;
    if (filter.search) {
      const escaped = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { familyDisplayName: { $regex: escaped, $options: 'i' } },
        { contactName: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (filter.after) {
      query.$and = [
        {
          $or: [
            { createdAt: { $lt: filter.after.date } },
            { createdAt: filter.after.date, _id: { $lt: filter.after.id } },
          ],
        },
      ];
    }
    return this.db
      .collection<InvitationRecord>('invitations')
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(filter.limit + 1)
      .toArray();
  }
  async overview(weddingId: ObjectId) {
    return this.transaction(async (session) => {
      const wedding = await this.db
        .collection<WeddingRecord>('weddings')
        .findOne({ _id: weddingId }, { session });
      if (!wedding) return null;
      const context = await this.snapshot(wedding, null, session);
      const totalFamilies = await this.db
        .collection('invitations')
        .countDocuments({ weddingId, archivedAt: null }, { session });
      const sentFamilies = await this.db
        .collection('invitations')
        .countDocuments(
          { weddingId, archivedAt: null, sentStatus: 'sent' },
          { session },
        );
      const counts = await this.db
        .collection('invitations')
        .aggregate<{ _id: ObjectId; count: number }>(
          [
            { $match: { weddingId, archivedAt: null, sentStatus: 'sent' } },
            { $project: { eventIds: { $setUnion: ['$eventIds', []] } } },
            { $unwind: '$eventIds' },
            { $group: { _id: '$eventIds', count: { $sum: 1 } } },
          ],
          { session },
        )
        .toArray();
      return {
        ...context,
        totalFamilies,
        sentFamilies,
        counts: Object.fromEntries(
          counts.map((c) => [c._id.toHexString(), c.count]),
        ),
      };
    });
  }
  async publicRead(slug: string, tokenHash: string) {
    return this.transaction(async (session) => {
      const wedding = await this.db
        .collection<WeddingRecord>('weddings')
        .findOne({ slug, publicationStatus: 'published' }, { session });
      if (!wedding) return null;
      const invitation = await this.db
        .collection<InvitationRecord>('invitations')
        .findOne(
          { weddingId: wedding._id, tokenHash, archivedAt: null },
          { session },
        );
      if (!invitation) return null;
      return this.snapshot(wedding, invitation, session);
    });
  }
  async mutate(
    actor: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (context: InvitationContext) => InvitationRecord,
    requestId: string,
  ) {
    return this.transaction(async (session) => {
      const authority = await this.db.collection<UserRecord>('users').updateOne(
        {
          _id: actor.user._id,
          weddingId: actor.user.weddingId,
          status: 'active',
          sessionVersion: actor.user.sessionVersion,
          role: actor.user.role,
        },
        { $inc: { accessRevision: 1 } },
        { session },
      );
      if (!authority.matchedCount)
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      // The parent write serializes selection checks with event archive/publication changes.
      const wedding = await this.db
        .collection<WeddingRecord>('weddings')
        .findOneAndUpdate(
          { _id: actor.user.weddingId },
          { $inc: { invitationWriteVersion: 1 } },
          { session, returnDocument: 'after' },
        );
      if (!wedding) throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
      const invitation = await this.db
        .collection<InvitationRecord>('invitations')
        .findOne({ _id: id, weddingId: wedding._id }, { session });
      const context = await this.snapshot(wedding, invitation, session),
        changed = work(context);
      if (!changed._id.equals(id) || !changed.weddingId.equals(wedding._id))
        throw new Error('Invalid invitation scope.');
      await this.db
        .collection<InvitationRecord>('invitations')
        .replaceOne({ _id: id, weddingId: wedding._id }, changed, {
          session,
          upsert: true,
        });
      await this.db.collection('auditLogs').insertOne(
        {
          weddingId: wedding._id,
          actorType: 'user',
          actorId: actor.user._id,
          action,
          entityType: 'invitation',
          entityId: id,
          timestamp: changed.updatedAt,
          requestId,
          schemaVersion: 1,
          createdAt: changed.updatedAt,
          updatedAt: changed.updatedAt,
        },
        { session },
      );
      return { ...context, invitation: changed };
    });
  }
}
