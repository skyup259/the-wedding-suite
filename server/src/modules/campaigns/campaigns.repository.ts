import { MongoServerError } from 'mongodb';
import type { ClientSession, Db, MongoClient, ObjectId } from 'mongodb';
import type {
  AuthSnapshot,
  UserRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
import type { InvitationRecord } from '../invitations/invitations.types.js';
import type {
  CampaignStore,
  CampaignUnit,
  BatchRecord,
  DispatchRecord,
  QuotaRecord,
  DeliveryReceipt,
} from './campaigns.types.js';
import { CAMPAIGNS_MIGRATION } from './campaigns.types.js';
import { HttpError } from '../../middleware/errors.js';
export class MongoCampaignStore implements CampaignStore {
  constructor(
    private client: MongoClient,
    private db: Db,
  ) {}
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string }>('schemaMigrations')
        .findOne({ _id: CAMPAIGNS_MIGRATION }),
    );
  }
  private async tx<T>(work: (session: ClientSession) => Promise<T>) {
    const s = this.client.startSession();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await s.withTransaction(() => work(s), {
            readConcern: { level: 'snapshot' },
          });
        } catch (error) {
          if (
            attempt < 2 &&
            error instanceof MongoServerError &&
            error.code === 11000 &&
            error.message.includes('emailProviderFences')
          )
            continue;
          throw error;
        }
      }
    } finally {
      await s.endSession();
    }
  }
  async transaction<T>(
    weddingId: ObjectId,
    actor: AuthSnapshot | null,
    work: (unit: CampaignUnit) => Promise<T>,
  ) {
    return this.tx(async (session) => {
      if (actor) {
        if (!actor.user.weddingId.equals(weddingId))
          throw new HttpError(404, 'NOT_FOUND', 'Email batch not found.');
        const authority = await this.db
          .collection<UserRecord>('users')
          .updateOne(
            {
              _id: actor.user._id,
              weddingId,
              status: 'active',
              sessionVersion: actor.user.sessionVersion,
              role: actor.user.role,
            },
            { $inc: { accessRevision: 1 } },
            { session },
          );
        if (!authority.matchedCount)
          throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      }
      const wedding = await this.db
        .collection<WeddingRecord>('weddings')
        .findOneAndUpdate(
          { _id: weddingId },
          { $inc: { invitationWriteVersion: 1 } },
          { session, returnDocument: 'after' },
        );
      if (!wedding) throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
      const events = await this.db
        .collection<EventRecord>('events')
        .find({ weddingId }, { session })
        .sort({ startAt: 1, sortOrder: 1, _id: 1 })
        .toArray();
      const invitations = this.db.collection<InvitationRecord>('invitations'),
        batches = this.db.collection<BatchRecord>('invitationEmailBatches'),
        jobs = this.db.collection<DispatchRecord>('jobs'),
        quotas = this.db.collection<QuotaRecord>('invitationEmailQuotas');
      const unit: CampaignUnit = {
        wedding,
        events,
        invitation: (id) =>
          invitations.findOne({ _id: id, weddingId }, { session }),
        saveInvitation: async (i) => {
          if (!i.weddingId.equals(weddingId)) throw new Error('Wrong scope');
          await invitations.replaceOne({ _id: i._id, weddingId }, i, {
            session,
          });
        },
        batch: (id) => batches.findOne({ _id: id, weddingId }, { session }),
        saveBatch: async (b) => {
          if (!b.weddingId.equals(weddingId)) throw new Error('Wrong scope');
          await batches.replaceOne({ _id: b._id, weddingId }, b, {
            session,
            upsert: true,
          });
        },
        dispatch: (id) =>
          jobs.findOne(
            { _id: id, weddingId, type: 'invitation_email' },
            { session },
          ),
        saveDispatch: async (j) => {
          if (!j.weddingId.equals(weddingId)) throw new Error('Wrong scope');
          await jobs.replaceOne(
            { _id: j._id, weddingId, type: 'invitation_email' },
            j,
            { session, upsert: true },
          );
        },
        dispatches: (batchId) =>
          jobs
            .find({ weddingId, batchId, type: 'invitation_email' }, { session })
            .sort({ _id: 1 })
            .limit(25)
            .toArray(),
        quota: () => quotas.findOne({ _id: weddingId }, { session }),
        saveQuota: async (q) => {
          await quotas.replaceOne({ _id: weddingId }, q, {
            session,
            upsert: true,
          });
        },
        receipts: async (providerId) => {
          await this.providerFence(providerId, session);
          return this.db
            .collection<DeliveryReceipt>('emailWebhookReceipts')
            .find({ providerId }, { session })
            .toArray();
        },
        audit: async (action, id, now, requestId) => {
          await this.db.collection('auditLogs').insertOne(
            {
              weddingId,
              actorType: actor ? 'user' : 'system',
              actorId: actor?.user._id ?? null,
              action,
              entityType: 'invitation_email',
              entityId: id,
              timestamp: now,
              requestId,
              schemaVersion: 1,
              createdAt: now,
              updatedAt: now,
            },
            { session },
          );
        },
      };
      return work(unit);
    });
  }
  async batches(weddingId: ObjectId, after?: ObjectId) {
    return this.db
      .collection<BatchRecord>('invitationEmailBatches')
      .find({ weddingId, ...(after ? { _id: { $lt: after } } : {}) })
      .sort({ _id: -1 })
      .limit(21)
      .toArray();
  }
  async dispatches(weddingId: ObjectId, batchId: ObjectId) {
    return this.db
      .collection<DispatchRecord>('jobs')
      .find({ weddingId, batchId, type: 'invitation_email' })
      .sort({ _id: 1 })
      .limit(25)
      .toArray();
  }
  async claim(owner: string, now: Date) {
    return this.db.collection<DispatchRecord>('jobs').findOneAndUpdate(
      {
        type: 'invitation_email',
        $or: [
          { status: 'queued', nextRunAt: { $lte: now } },
          { status: 'running', leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseOwner: owner,
          leaseUntil: new Date(+now + 60000),
          updatedAt: now,
        },
        $inc: { attempts: 1, leaseVersion: 1, revision: 1 },
      },
      { sort: { nextRunAt: 1, _id: 1 }, returnDocument: 'after' },
    );
  }
  async sweep(now: Date) {
    await this.db
      .collection('invitationEmailBatches')
      .updateMany(
        { status: 'preview', expiresAt: { $lte: now } },
        { $set: { 'items.$[].payload': null } },
      );
    await this.db.collection('jobs').updateMany(
      {
        type: 'invitation_email',
        status: 'failed',
        firstAttemptAt: { $lte: new Date(+now - 23 * 3600000) },
      },
      { $set: { payload: null, retryable: false } },
    );
  }
  private async providerFence(providerId: string, session: ClientSession) {
    await this.db
      .collection<{ _id: string; revision: number }>('emailProviderFences')
      .updateOne(
        { _id: providerId },
        { $inc: { revision: 1 } },
        { session, upsert: true },
      );
  }
  async webhook(
    receipt: DeliveryReceipt,
    apply: (job: DispatchRecord) => void,
  ) {
    try {
      await this.tx(async (session) => {
        const receipts = this.db.collection<DeliveryReceipt>(
          'emailWebhookReceipts',
        );
        if (await receipts.findOne({ _id: receipt._id }, { session })) return;
        await this.providerFence(receipt.providerId, session);
        await receipts.insertOne(receipt, { session });
        const jobs = this.db.collection<DispatchRecord>('jobs'),
          job = await jobs.findOne(
            { type: 'invitation_email', providerId: receipt.providerId },
            { session },
          );
        if (job) {
          apply(job);
          await jobs.replaceOne(
            { _id: job._id, type: 'invitation_email' },
            job,
            { session },
          );
        }
      });
    } catch (error) {
      if (
        error instanceof MongoServerError &&
        error.code === 11000 &&
        (await this.db
          .collection('emailWebhookReceipts')
          .findOne({ _id: receipt._id } as never))
      )
        return;
      throw error;
    }
  }
}
