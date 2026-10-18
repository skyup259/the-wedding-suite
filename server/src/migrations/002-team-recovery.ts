import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { Db, Document } from 'mongodb';
import { ACCESS_MIGRATION } from '../modules/access/access.repository.js';
export async function migrateAccess(db: Db) {
  const history = db.collection<{
      _id: string;
      owner?: string;
      acquiredAt?: Date;
      appliedAt?: Date;
    }>('schemaMigrations'),
    owner = randomUUID();
  await history.insertOne({
    _id: '__migration_lock',
    owner,
    acquiredAt: new Date(),
  });
  try {
    if (await history.findOne({ _id: ACCESS_MIGRATION })) return;
    if (!(await history.findOne({ _id: '001-auth-foundation' })))
      throw new Error('Apply auth migration first.');
    const oid = { bsonType: 'objectId' },
      date = { bsonType: 'date' },
      nullableDate = { bsonType: ['date', 'null'] },
      integer = { bsonType: 'int', minimum: 1 },
      nullableId = { bsonType: ['objectId', 'null'] };
    const schemas: Record<string, Document> = {
      authTokens: {
        bsonType: 'object',
        required: [
          '_id',
          'weddingId',
          'purpose',
          'tokenHash',
          'emailNormalized',
          'displayName',
          'userId',
          'invitedBy',
          'sessionVersion',
          'expiresAt',
          'usedAt',
          'revokedAt',
          'revision',
          'schemaVersion',
          'createdAt',
          'updatedAt',
        ],
        properties: {
          _id: oid,
          weddingId: oid,
          purpose: { enum: ['manager_invite', 'password_reset'] },
          tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
          emailNormalized: { bsonType: 'string', maxLength: 254 },
          displayName: { bsonType: ['string', 'null'], maxLength: 100 },
          userId: nullableId,
          invitedBy: oid,
          sessionVersion: { bsonType: ['int', 'null'] },
          expiresAt: date,
          usedAt: nullableDate,
          revokedAt: nullableDate,
          revision: integer,
          schemaVersion: integer,
          createdAt: date,
          updatedAt: date,
        },
      },
      jobs: {
        bsonType: 'object',
        required: [
          '_id',
          'weddingId',
          'type',
          'tokenId',
          'tokenRevision',
          'payload',
          'idempotencyKey',
          'status',
          'attempts',
          'maxAttempts',
          'nextRunAt',
          'leaseUntil',
          'leaseOwner',
          'leaseVersion',
          'firstAttemptAt',
          'expiresAt',
          'createdAt',
          'updatedAt',
          'completedAt',
          'errorCode',
          'outcome',
        ],
        properties: {
          _id: oid,
          weddingId: oid,
          type: { enum: ['auth_email'] },
          tokenId: oid,
          tokenRevision: integer,
          payload: { bsonType: ['string', 'null'] },
          idempotencyKey: { bsonType: 'string' },
          status: { enum: ['queued', 'running', 'completed', 'failed'] },
          attempts: { bsonType: 'int', minimum: 0 },
          maxAttempts: integer,
          nextRunAt: date,
          leaseUntil: nullableDate,
          leaseOwner: { bsonType: ['string', 'null'] },
          leaseVersion: { bsonType: 'int', minimum: 0 },
          firstAttemptAt: nullableDate,
          expiresAt: date,
          createdAt: date,
          updatedAt: date,
          completedAt: nullableDate,
          errorCode: { bsonType: ['string', 'null'] },
          outcome: { enum: [null, 'accepted', 'outbox', 'cancelled'] },
        },
      },
    };
    for (const [name, schema] of Object.entries(schemas)) {
      try {
        await db.createCollection(name, {
          validator: { $jsonSchema: schema },
          validationLevel: 'strict',
          validationAction: 'error',
        });
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 48))
          throw error;
        await db.command({
          collMod: name,
          validator: { $jsonSchema: schema },
          validationLevel: 'strict',
          validationAction: 'error',
        });
      }
    }
    await db.collection('authTokens').createIndexes([
      {
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
        name: 'expired_access_tokens',
      },
      { key: { tokenHash: 1 }, unique: true, name: 'unique_access_token_hash' },
      {
        key: { weddingId: 1, emailNormalized: 1 },
        unique: true,
        partialFilterExpression: { purpose: 'manager_invite' },
        name: 'unique_wedding_manager_invitation',
      },
      { key: { userId: 1, purpose: 1 }, name: 'user_recovery_tokens' },
      {
        key: { weddingId: 1, purpose: 1, createdAt: -1, _id: -1 },
        name: 'wedding_invitations',
      },
    ]);
    await db.collection('jobs').createIndexes([
      {
        key: { weddingId: 1, idempotencyKey: 1 },
        unique: true,
        name: 'unique_job_effect',
      },
      { key: { status: 1, nextRunAt: 1 }, name: 'queued_jobs' },
      { key: { status: 1, leaseUntil: 1 }, name: 'abandoned_jobs' },
      { key: { tokenId: 1, tokenRevision: 1 }, name: 'token_email_jobs' },
    ]);
    await history.insertOne({ _id: ACCESS_MIGRATION, appliedAt: new Date() });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
