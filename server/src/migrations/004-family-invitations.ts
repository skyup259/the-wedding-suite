import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { Db } from 'mongodb';
import { INVITATIONS_MIGRATION } from '../modules/invitations/invitations.repository.js';
export async function migrateInvitations(db: Db) {
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
    if (await history.findOne({ _id: INVITATIONS_MIGRATION })) return;
    if (!(await history.findOne({ _id: '003-wedding-events' })))
      throw new Error('Apply website migration first.');
    const oid = { bsonType: 'objectId' },
      date = { bsonType: 'date' },
      nullableDate = { bsonType: ['date', 'null'] },
      int = { bsonType: 'int', minimum: 1 };
    const schema = {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'weddingId',
        'familyDisplayName',
        'contactName',
        'phone',
        'eventIds',
        'tokenHash',
        'tokenCiphertext',
        'tokenKeyVersion',
        'tokenVersion',
        'sentStatus',
        'sentAt',
        'archivedAt',
        'revision',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
        'schemaVersion',
      ],
      properties: {
        _id: oid,
        weddingId: oid,
        familyDisplayName: { bsonType: 'string', minLength: 1, maxLength: 120 },
        contactName: { bsonType: 'string', minLength: 1, maxLength: 120 },
        phone: { bsonType: 'string', maxLength: 25 },
        eventIds: {
          bsonType: 'array',
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: oid,
        },
        tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
        tokenCiphertext: { bsonType: 'string' },
        tokenKeyVersion: { enum: [1] },
        tokenVersion: int,
        sentStatus: { enum: ['sent', 'not_sent'] },
        sentAt: nullableDate,
        archivedAt: nullableDate,
        revision: int,
        createdAt: date,
        updatedAt: date,
        createdBy: oid,
        updatedBy: oid,
        schemaVersion: { enum: [1] },
      },
    };
    const validator = {
      $and: [
        { $jsonSchema: schema },
        {
          $expr: {
            $cond: [
              { $eq: ['$sentStatus', 'sent'] },
              { $ne: ['$sentAt', null] },
              { $eq: ['$sentAt', null] },
            ],
          },
        },
      ],
    };
    try {
      await db.createCollection('invitations', {
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    } catch (e) {
      if (!(e instanceof MongoServerError && e.code === 48)) throw e;
      await db.command({
        collMod: 'invitations',
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
    // No legacy invitation implementation exists. Refuse to silently bless incompatible records.
    if (
      await db
        .collection('invitations')
        .countDocuments({ $nor: [validator] }, { limit: 1 })
    )
      throw new Error(
        'Existing invitation data requires explicit reconciliation.',
      );
    await db
      .collection('invitations')
      .createIndex(
        { tokenHash: 1 },
        { unique: true, name: 'invitation_token' },
      );
    await db
      .collection('invitations')
      .createIndex(
        { weddingId: 1, archivedAt: 1, createdAt: -1, _id: -1 },
        { name: 'invitation_list' },
      );
    await db
      .collection('invitations')
      .createIndex(
        { weddingId: 1, archivedAt: 1, sentStatus: 1, createdAt: -1, _id: -1 },
        { name: 'invitation_sent' },
      );
    await db
      .collection('invitations')
      .createIndex(
        { weddingId: 1, archivedAt: 1, eventIds: 1, createdAt: -1, _id: -1 },
        { name: 'invitation_events' },
      );
    await history.insertOne({
      _id: INVITATIONS_MIGRATION,
      appliedAt: new Date(),
    });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
