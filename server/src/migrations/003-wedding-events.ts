import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { Db } from 'mongodb';
import { WEBSITE_MIGRATION } from '../modules/website/website.repository.js';
export async function migrateWebsite(db: Db) {
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
    if (await history.findOne({ _id: WEBSITE_MIGRATION })) return;
    if (!(await history.findOne({ _id: '001-auth-foundation' })))
      throw new Error('Apply auth migration first.');
    const oid = { bsonType: 'objectId' },
      date = { bsonType: 'date' },
      text = { bsonType: 'string' },
      schema = {
        bsonType: 'object',
        required: [
          '_id',
          'weddingId',
          'name',
          'description',
          'startAt',
          'endAt',
          'venue',
          'contacts',
          'status',
          'sortOrder',
          'stream',
          'revision',
          'archivedAt',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
          'schemaVersion',
        ],
        properties: {
          _id: oid,
          weddingId: oid,
          name: { bsonType: 'string', minLength: 1, maxLength: 100 },
          description: text,
          startAt: date,
          endAt: { bsonType: ['date', 'null'] },
          venue: {
            bsonType: 'object',
            required: ['name', 'address', 'mapUrl'],
            properties: { name: text, address: text, mapUrl: text },
          },
          contacts: {
            bsonType: 'array',
            maxItems: 2,
            items: {
              bsonType: 'object',
              required: ['name', 'phone'],
              properties: { name: text, phone: text },
            },
          },
          status: { enum: ['not_started', 'in_progress', 'completed'] },
          sortOrder: { bsonType: 'int', minimum: 0 },
          stream: { bsonType: 'null' },
          revision: { bsonType: 'int', minimum: 1 },
          archivedAt: { bsonType: ['date', 'null'] },
          createdAt: date,
          updatedAt: date,
          createdBy: oid,
          updatedBy: oid,
          schemaVersion: { bsonType: 'int', minimum: 1 },
        },
      };
    try {
      await db.createCollection('events', {
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error',
      });
    } catch (e) {
      if (!(e instanceof MongoServerError && e.code === 48)) throw e;
      await db.command({
        collMod: 'events',
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
    await db
      .collection('events')
      .createIndex(
        { weddingId: 1, archivedAt: 1, startAt: 1, sortOrder: 1, _id: 1 },
        { name: 'wedding_schedule' },
      );
    await history.insertOne({ _id: WEBSITE_MIGRATION, appliedAt: new Date() });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
