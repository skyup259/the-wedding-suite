import { randomUUID } from 'node:crypto';
import { Long, MongoServerError } from 'mongodb';
import type { Db } from 'mongodb';
import { EXPENSES_MIGRATION } from '../modules/expenses/expenses.repository.js';
export async function migrateExpenses(db: Db) {
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
    if (await history.findOne({ _id: EXPENSES_MIGRATION })) return;
    if (!(await history.findOne({ _id: '003-wedding-events' })))
      throw new Error('Apply website migration first.');
    const oid = { bsonType: 'objectId' },
      date = { bsonType: 'date' },
      nullableId = { bsonType: ['objectId', 'null'] },
      text = (max: number, min = 0) => ({
        bsonType: 'string',
        minLength: min,
        maxLength: max,
      }),
      money = { bsonType: 'long', minimum: Long.ZERO, maximum: Long.MAX_VALUE };
    const payment = {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'amountPaise',
        'paidByName',
        'paidByUserId',
        'paymentDate',
        'method',
        'notes',
        'createdAt',
        'createdBy',
      ],
      properties: {
        _id: oid,
        amountPaise: { ...money, minimum: Long.ONE },
        paidByName: text(120, 1),
        paidByUserId: nullableId,
        paymentDate: {
          bsonType: 'string',
          pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
        },
        method: text(80),
        notes: text(2000),
        createdAt: date,
        createdBy: oid,
      },
    };
    const schema = {
      bsonType: 'object',
      additionalProperties: false,
      required: [
        '_id',
        'weddingId',
        'eventId',
        'description',
        'category',
        'vendorName',
        'notes',
        'currency',
        'costPaise',
        'payments',
        'paymentRequests',
        'revision',
        'schemaVersion',
        'archivedAt',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
      ],
      properties: {
        _id: oid,
        weddingId: oid,
        eventId: nullableId,
        description: text(200, 1),
        category: text(80, 1),
        vendorName: text(160),
        notes: text(2000),
        currency: { enum: ['INR'] },
        costPaise: money,
        payments: { bsonType: 'array', maxItems: 500, items: payment },
        paymentRequests: {
          bsonType: 'array',
          maxItems: 500,
          items: {
            bsonType: 'object',
            additionalProperties: false,
            required: ['key', 'hash', 'paymentId'],
            properties: {
              key: { bsonType: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' },
              hash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
              paymentId: oid,
            },
          },
        },
        revision: { bsonType: 'int', minimum: 1 },
        schemaVersion: { enum: [1] },
        archivedAt: { bsonType: ['date', 'null'] },
        createdAt: date,
        updatedAt: date,
        createdBy: oid,
        updatedBy: oid,
      },
    };
    const validator = { $jsonSchema: schema };
    try {
      await db.createCollection('expenses', {
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    } catch (e) {
      if (!(e instanceof MongoServerError && e.code === 48)) throw e;
      await db.command({
        collMod: 'expenses',
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      });
    }
    if (
      await db
        .collection('expenses')
        .countDocuments({ $nor: [validator] }, { limit: 1 })
    )
      throw new Error('Existing expense data requires reconciliation.');
    for (const [name, keys] of Object.entries({
      expense_list: { weddingId: 1, archivedAt: 1, _id: -1 },
      expense_event: { weddingId: 1, archivedAt: 1, eventId: 1, _id: -1 },
      expense_category: { weddingId: 1, archivedAt: 1, category: 1, _id: -1 },
      expense_payer: {
        weddingId: 1,
        archivedAt: 1,
        'payments.paidByUserId': 1,
        _id: -1,
      },
    }))
      await db
        .collection('expenses')
        .createIndex(keys as Record<string, 1 | -1>, { name });
    await history.insertOne({ _id: EXPENSES_MIGRATION, appliedAt: new Date() });
  } finally {
    await history.deleteOne({ _id: '__migration_lock', owner });
  }
}
