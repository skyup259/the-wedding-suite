import type { Db, Document } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { AUTH_MIGRATION } from '../modules/auth/auth.repository.js';

const objectId = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const integer = { bsonType: 'int', minimum: 1 };
const base = {
  _id: objectId,
  schemaVersion: integer,
  createdAt: date,
  updatedAt: date,
};
const requiredBase = ['_id', 'schemaVersion', 'createdAt', 'updatedAt'];
const schemas: Record<string, Document> = {
  users: {
    bsonType: 'object',
    required: [
      ...requiredBase,
      'weddingId',
      'emailNormalized',
      'displayName',
      'passwordHash',
      'role',
      'status',
      'sessionVersion',
      'passwordChangedAt',
    ],
    properties: {
      ...base,
      weddingId: objectId,
      emailNormalized: { bsonType: 'string', maxLength: 254 },
      displayName: { bsonType: 'string', minLength: 1, maxLength: 100 },
      passwordHash: { bsonType: 'string' },
      role: { enum: ['admin', 'manager'] },
      status: { enum: ['active', 'disabled'] },
      sessionVersion: integer,
      passwordChangedAt: date,
    },
  },
  weddings: {
    bsonType: 'object',
    required: [
      ...requiredBase,
      'couple',
      'mainDate',
      'timezone',
      'slug',
      'publicationStatus',
      'website',
      'gallery',
      'photoExpiryAt',
      'retentionVersion',
      'mediaCleanup',
      'revision',
      'createdBy',
      'updatedBy',
    ],
    properties: {
      ...base,
      couple: {
        bsonType: 'object',
        required: ['partner1Name', 'partner2Name'],
        properties: {
          partner1Name: { bsonType: 'string', minLength: 1, maxLength: 100 },
          partner2Name: { bsonType: 'string', minLength: 1, maxLength: 100 },
        },
      },
      mainDate: { bsonType: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
      timezone: { bsonType: 'string' },
      slug: { bsonType: 'string', minLength: 1 },
      publicationStatus: { enum: ['draft', 'published'] },
      website: {
        bsonType: 'object',
        required: ['themeId'],
        properties: { themeId: { enum: ['traditional', 'floral', 'minimal'] } },
      },
      gallery: { bsonType: 'object' },
      photoExpiryAt: date,
      retentionVersion: integer,
      mediaCleanup: { bsonType: 'object' },
      revision: integer,
      createdBy: objectId,
      updatedBy: objectId,
    },
  },
  sessions: {
    bsonType: 'object',
    required: [
      ...requiredBase,
      'weddingId',
      'userId',
      'tokenHash',
      'sessionVersion',
      'expiresAt',
      'revokedAt',
    ],
    properties: {
      ...base,
      weddingId: objectId,
      userId: objectId,
      tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
      sessionVersion: integer,
      expiresAt: date,
      revokedAt: { bsonType: ['date', 'null'] },
    },
  },
  authRateLimits: {
    bsonType: 'object',
    required: ['_id', 'count', 'expiresAt'],
    properties: {
      _id: { bsonType: 'string' },
      count: { bsonType: ['int', 'long', 'double'], minimum: 1 },
      expiresAt: date,
    },
  },
  auditLogs: {
    bsonType: 'object',
    required: [
      'weddingId',
      'actorType',
      'actorId',
      'action',
      'entityType',
      'entityId',
      'timestamp',
      'requestId',
    ],
    properties: {
      weddingId: objectId,
      actorType: { enum: ['user', 'system'] },
      actorId: objectId,
      action: { bsonType: 'string' },
      entityType: { bsonType: 'string' },
      entityId: objectId,
      timestamp: date,
      requestId: { bsonType: 'string' },
    },
  },
};
export async function migrateAuth(db: Db): Promise<void> {
  const history = db.collection<{
    _id: string;
    appliedAt?: Date;
    owner?: string;
    acquiredAt?: Date;
  }>('schemaMigrations');
  const owner = randomUUID();
  try {
    // A lock is released only by its owner. After a hard crash an operator must
    // confirm that no runner remains before removing this single lock record.
    await history.insertOne({
      _id: '__migration_lock',
      owner,
      acquiredAt: new Date(),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new Error(
        'Another migration is running. Retry after it finishes.',
        { cause: error },
      );
    throw error;
  }
  try {
    if (await history.findOne({ _id: AUTH_MIGRATION })) return;
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
    await db.collection('users').createIndexes([
      { key: { emailNormalized: 1 }, name: 'unique_email', unique: true },
      {
        key: { weddingId: 1, role: 1 },
        name: 'one_admin_per_wedding',
        unique: true,
        partialFilterExpression: { role: 'admin' },
      },
      { key: { weddingId: 1, status: 1 }, name: 'wedding_team' },
    ]);
    await db
      .collection('weddings')
      .createIndex({ slug: 1 }, { unique: true, name: 'unique_slug' });
    await db.collection('sessions').createIndexes([
      { key: { tokenHash: 1 }, unique: true, name: 'unique_session_hash' },
      {
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
        name: 'expired_sessions',
      },
      { key: { userId: 1 }, name: 'user_sessions' },
    ]);
    await db
      .collection('authRateLimits')
      .createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'expired_rate_windows' },
      );
    await db
      .collection('auditLogs')
      .createIndex({ weddingId: 1, timestamp: -1 }, { name: 'wedding_audit' });
    await history.insertOne({ _id: AUTH_MIGRATION, appliedAt: new Date() });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
