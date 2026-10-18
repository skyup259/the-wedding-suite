import { MongoServerError } from 'mongodb';
import type { Db, MongoClient, ClientSession, ObjectId } from 'mongodb';
import { HttpError } from '../../middleware/errors.js';
import type {
  AuthSnapshot,
  UserRecord,
  SessionRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
import type {
  AccessStore,
  AccessUnit,
  AccessToken,
  EmailJob,
} from './access.types.js';
export const ACCESS_MIGRATION = '002-team-recovery';
class MongoAccessUnit implements AccessUnit {
  constructor(
    private db: Db,
    private session: ClientSession,
  ) {}
  private get options() {
    return { session: this.session };
  }
  userByEmail(email: string) {
    return this.db
      .collection<UserRecord>('users')
      .findOne({ emailNormalized: email }, this.options);
  }
  userById(id: ObjectId, weddingId: ObjectId) {
    return this.db
      .collection<UserRecord>('users')
      .findOne({ _id: id, weddingId }, this.options);
  }
  wedding(id: ObjectId) {
    return this.db
      .collection<WeddingRecord>('weddings')
      .findOne({ _id: id }, this.options);
  }
  tokenByHash(tokenHash: string, purpose: AccessToken['purpose']) {
    return this.db
      .collection<AccessToken>('authTokens')
      .findOne({ tokenHash, purpose }, this.options);
  }
  tokenById(id: ObjectId, weddingId: ObjectId) {
    return this.db
      .collection<AccessToken>('authTokens')
      .findOne({ _id: id, weddingId, purpose: 'manager_invite' }, this.options);
  }
  invitationByEmail(emailNormalized: string, weddingId: ObjectId) {
    return this.db
      .collection<AccessToken>('authTokens')
      .findOne(
        { emailNormalized, weddingId, purpose: 'manager_invite' },
        this.options,
      );
  }
  async saveToken(token: AccessToken) {
    await this.db
      .collection<AccessToken>('authTokens')
      .replaceOne({ _id: token._id }, token, { ...this.options, upsert: true });
  }
  async saveUser(user: UserRecord) {
    await this.db
      .collection<UserRecord>('users')
      .replaceOne({ _id: user._id }, user, { ...this.options, upsert: true });
  }
  async insertSession(session: SessionRecord, previousHash?: string) {
    await this.db
      .collection<SessionRecord>('sessions')
      .insertOne(session, this.options);
    if (previousHash)
      await this.db.collection<SessionRecord>('sessions').updateOne(
        { tokenHash: previousHash, revokedAt: null },
        {
          $set: {
            revokedAt: session.createdAt,
            updatedAt: session.createdAt,
          },
        },
        this.options,
      );
  }
  async revokeSessions(userId: ObjectId, now: Date) {
    await this.db
      .collection<SessionRecord>('sessions')
      .updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: now, updatedAt: now } },
        this.options,
      );
  }
  async invalidateTokens(userId: ObjectId, now: Date) {
    await this.db
      .collection<AccessToken>('authTokens')
      .updateMany(
        { userId, purpose: 'password_reset', usedAt: null, revokedAt: null },
        { $set: { revokedAt: now, updatedAt: now }, $inc: { revision: 1 } },
        this.options,
      );
  }
  async cancelEmails(tokenId: ObjectId, now: Date) {
    await this.db.collection<EmailJob>('jobs').updateMany(
      { tokenId, status: { $in: ['queued', 'running'] } },
      {
        $set: {
          status: 'completed',
          outcome: 'cancelled',
          payload: null,
          leaseOwner: null,
          leaseUntil: null,
          completedAt: now,
          updatedAt: now,
        },
      },
      this.options,
    );
  }
  async enqueue(job: EmailJob) {
    await this.db.collection<EmailJob>('jobs').insertOne(job, this.options);
  }
  async audit(
    weddingId: ObjectId,
    actorId: ObjectId,
    entityId: ObjectId,
    action: string,
    now: Date,
    requestId: string,
  ) {
    await this.db.collection('auditLogs').insertOne(
      {
        weddingId,
        actorType: 'user',
        actorId,
        entityType: 'access',
        entityId,
        action,
        timestamp: now,
        requestId,
      },
      this.options,
    );
  }
}
export class MongoAccessStore implements AccessStore {
  constructor(
    private client: MongoClient,
    private db: Db,
  ) {}
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string }>('schemaMigrations')
        .findOne({ _id: ACCESS_MIGRATION }),
    );
  }
  async transaction<T>(
    actor: AuthSnapshot | null,
    work: (unit: AccessUnit) => Promise<T>,
  ): Promise<T> {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        if (actor) {
          // Write-lock the actor as well as checking current authority: disable/reset races
          // conflict with this transaction instead of acting on a stale HTTP snapshot.
          const result = await this.db
            .collection<UserRecord>('users')
            .updateOne(
              {
                _id: actor.user._id,
                weddingId: actor.user.weddingId,
                status: 'active',
                role: actor.user.role,
                sessionVersion: actor.user.sessionVersion,
              },
              { $inc: { accessRevision: 1 } },
              { session },
            );
          if (!result.matchedCount)
            throw new HttpError(
              401,
              'SESSION_EXPIRED',
              'Please sign in again.',
            );
        }
        return work(new MongoAccessUnit(this.db, session));
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        throw new HttpError(
          409,
          'ACCOUNT_ALREADY_ASSIGNED',
          'This email already has an account or invitation. Refresh and try again.',
        );
      throw error;
    } finally {
      await session.endSession();
    }
  }
  members(weddingId: ObjectId, after?: ObjectId, limit = 21) {
    return this.db
      .collection<UserRecord>('users')
      .find({ weddingId, ...(after ? { _id: { $gt: after } } : {}) })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
  }
  invitations(weddingId: ObjectId, after?: ObjectId, limit = 21) {
    return this.db
      .collection<AccessToken>('authTokens')
      .find({
        weddingId,
        purpose: 'manager_invite',
        ...(after ? { _id: { $gt: after } } : {}),
      })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
  }
  deliveries(weddingId: ObjectId, tokenIds: ObjectId[]) {
    return this.db
      .collection<EmailJob>('jobs')
      .aggregate<EmailJob>([
        {
          $match: { weddingId, type: 'auth_email', tokenId: { $in: tokenIds } },
        },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: '$tokenId', job: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$job' } },
      ])
      .toArray();
  }
  async claim(leaseOwner: string, now: Date) {
    const jobs = this.db.collection<EmailJob>('jobs');
    const job = await jobs.findOneAndUpdate(
      {
        type: 'auth_email',
        $or: [
          { status: 'queued', nextRunAt: { $lte: now } },
          { status: 'running', leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: 'running',
          leaseOwner,
          leaseUntil: new Date(now.getTime() + 60000),
          updatedAt: now,
        },
        $inc: { attempts: 1, leaseVersion: 1 },
      },
      { sort: { nextRunAt: 1, _id: 1 }, returnDocument: 'after' },
    );
    if (job && !job.firstAttemptAt) {
      const saved = await jobs.updateOne(
        { ...this.guard(job), leaseUntil: { $gt: now } },
        { $set: { firstAttemptAt: now } },
      );
      if (!saved.matchedCount) return null;
      job.firstAttemptAt = now;
    }
    return job;
  }
  async validJob(job: EmailJob, now: Date) {
    if (
      !(await this.db
        .collection<EmailJob>('jobs')
        .findOne({ ...this.guard(job), leaseUntil: { $gt: now } }))
    )
      return false;
    const token = await this.db.collection<AccessToken>('authTokens').findOne({
      _id: job.tokenId,
      revision: job.tokenRevision,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (!token) return false;
    if (token.purpose === 'password_reset')
      return Boolean(
        await this.db.collection<UserRecord>('users').findOne({
          _id: token.userId!,
          status: 'active',
          sessionVersion: token.sessionVersion!,
        }),
      );
    return true;
  }
  private guard(job: EmailJob) {
    return {
      _id: job._id,
      status: 'running' as const,
      leaseOwner: job.leaseOwner,
      leaseVersion: job.leaseVersion,
    };
  }
  async finish(job: EmailJob, now: Date, outcome: EmailJob['outcome']) {
    await this.db.collection<EmailJob>('jobs').updateOne(
      { ...this.guard(job), leaseUntil: { $gt: now } },
      {
        $set: {
          status: 'completed',
          outcome,
          payload: null,
          leaseUntil: null,
          leaseOwner: null,
          completedAt: now,
          updatedAt: now,
          errorCode: null,
        },
      },
    );
  }
  async fail(job: EmailJob, now: Date, code: string, permanent: boolean) {
    const terminal = permanent || job.attempts >= job.maxAttempts;
    await this.db.collection<EmailJob>('jobs').updateOne(
      { ...this.guard(job), leaseUntil: { $gt: now } },
      {
        $set: {
          status: terminal ? 'failed' : 'queued',
          payload: terminal ? null : job.payload,
          errorCode: code,
          leaseUntil: null,
          leaseOwner: null,
          updatedAt: now,
          firstAttemptAt: job.firstAttemptAt ?? now,
          nextRunAt: new Date(
            now.getTime() + Math.min(3600000, 30000 * 2 ** (job.attempts - 1)),
          ),
        },
      },
    );
  }
}
