import { MongoServerError } from 'mongodb';
import type { Db, MongoClient } from 'mongodb';
import type {
  AuthStore,
  RegistrationRecords,
  SessionRecord,
  UserRecord,
  WeddingRecord,
} from './auth.types.js';
import { DuplicateAccountError } from './auth.types.js';

export const AUTH_MIGRATION = '001-auth-foundation';
export class MongoAuthStore implements AuthStore {
  constructor(
    private readonly client: MongoClient,
    private readonly db: Db,
  ) {}
  private get users() {
    return this.db.collection<UserRecord>('users');
  }
  private get weddings() {
    return this.db.collection<WeddingRecord>('weddings');
  }
  private get sessions() {
    return this.db.collection<SessionRecord>('sessions');
  }
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string; appliedAt: Date }>('schemaMigrations')
        .findOne({ _id: AUTH_MIGRATION }),
    );
  }
  findUser(email: string) {
    return this.users.findOne({ emailNormalized: email });
  }
  async resolve(tokenHash: string, now: Date) {
    const session = await this.sessions.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    if (!session) return null;
    const user = await this.users.findOne({
      _id: session.userId,
      weddingId: session.weddingId,
      status: 'active',
      sessionVersion: session.sessionVersion,
    });
    if (!user) return null;
    const wedding = await this.weddings.findOne({ _id: user.weddingId });
    return wedding ? { user, wedding } : null;
  }
  async register(records: RegistrationRecords, previousHash?: string) {
    const tx = this.client.startSession();
    try {
      await tx.withTransaction(async () => {
        await this.weddings.insertOne(records.wedding, { session: tx });
        await this.users.insertOne(records.user, { session: tx });
        await this.sessions.insertOne(records.session, { session: tx });
        if (previousHash)
          await this.sessions.updateOne(
            { tokenHash: previousHash, revokedAt: null },
            { $set: { revokedAt: records.session.createdAt } },
            { session: tx },
          );
        await this.db.collection('auditLogs').insertOne(
          {
            weddingId: records.wedding._id,
            actorType: 'user',
            actorId: records.user._id,
            action: 'account_registered',
            entityType: 'user',
            entityId: records.user._id,
            timestamp: records.user.createdAt,
            createdAt: records.user.createdAt,
            updatedAt: records.user.createdAt,
            schemaVersion: 1,
            requestId: records.requestId,
          },
          { session: tx },
        );
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new DuplicateAccountError(
          error.keyPattern?.slug ? 'slug' : 'email',
        );
      }
      throw error;
    } finally {
      await tx.endSession();
    }
  }
  async loginSession(
    user: UserRecord,
    session: SessionRecord,
    previousHash?: string,
  ) {
    const tx = this.client.startSession();
    try {
      return await tx.withTransaction(async () => {
        const current = await this.users.findOne(
          {
            _id: user._id,
            weddingId: user.weddingId,
            status: 'active',
            sessionVersion: user.sessionVersion,
            passwordHash: user.passwordHash,
          },
          { session: tx },
        );
        if (!current) return null;
        const wedding = await this.weddings.findOne(
          { _id: current.weddingId },
          { session: tx },
        );
        if (!wedding) return null;
        await this.sessions.insertOne(session, { session: tx });
        if (previousHash)
          await this.sessions.updateOne(
            { tokenHash: previousHash, revokedAt: null },
            { $set: { revokedAt: session.createdAt } },
            { session: tx },
          );
        return { user: current, wedding };
      });
    } finally {
      await tx.endSession();
    }
  }
  async revoke(tokenHash: string, now: Date) {
    await this.sessions.updateOne(
      { tokenHash, revokedAt: null },
      { $set: { revokedAt: now, updatedAt: now } },
    );
  }
  async consume(key: string, expiresAt: Date) {
    const collection = this.db.collection<{
      _id: string;
      count: number;
      expiresAt: Date;
    }>('authRateLimits');
    try {
      const result = await collection.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: 'after' },
      );
      return result!.count;
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000))
        throw error;
      const result = await collection.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 } },
        { returnDocument: 'after' },
      );
      return result!.count;
    }
  }
}
