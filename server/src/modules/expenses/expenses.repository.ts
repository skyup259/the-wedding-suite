import { ObjectId } from 'mongodb';
import type { Db, MongoClient, Filter } from 'mongodb';
import type {
  AuthSnapshot,
  UserRecord,
  WeddingRecord,
} from '../auth/auth.types.js';
import type { EventRecord } from '../website/website.types.js';
import type {
  ExpenseRecord,
  ExpenseFilter,
  ExpenseStore,
  ExpenseContext,
} from './expenses.types.js';
import { HttpError } from '../../middleware/errors.js';
export const EXPENSES_MIGRATION = '006-expenses-payments';
export class MongoExpenseStore implements ExpenseStore {
  constructor(
    private client: MongoClient,
    private db: Db,
  ) {}
  async ready() {
    return Boolean(
      await this.db
        .collection<{ _id: string }>('schemaMigrations')
        .findOne({ _id: EXPENSES_MIGRATION }),
    );
  }
  async get(weddingId: ObjectId, id: ObjectId) {
    return this.db
      .collection<ExpenseRecord>('expenses')
      .findOne(
        { _id: id, weddingId, archivedAt: null },
        { promoteLongs: false },
      );
  }
  async *scan(weddingId: ObjectId, f: ExpenseFilter) {
    const q: Filter<ExpenseRecord> = { weddingId, archivedAt: null };
    if (f.eventId)
      q.eventId = f.eventId === 'shared' ? null : new ObjectId(f.eventId);
    if (f.category) q.category = f.category;
    if (f.payerName || f.payerUserId)
      q.payments = {
        $elemMatch: {
          ...(f.payerName ? { paidByName: f.payerName } : {}),
          ...(f.payerUserId
            ? { paidByUserId: new ObjectId(f.payerUserId) }
            : {}),
        },
      };
    const cursor = this.db
      .collection<ExpenseRecord>('expenses')
      .find(q, { promoteLongs: false })
      .sort({ _id: -1 });
    try {
      for await (const row of cursor) yield row;
    } finally {
      await cursor.close();
    }
  }
  async mutate(
    actor: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (c: ExpenseContext) => ExpenseRecord,
    requestId: string,
  ) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(
        async () => {
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
              { session },
            );
          if (!authority.matchedCount)
            throw new HttpError(
              401,
              'SESSION_EXPIRED',
              'Please sign in again.',
            );
          // Serialize event selection with ceremony archive and website changes.
          const wedding = await this.db
            .collection<WeddingRecord>('weddings')
            .findOneAndUpdate(
              { _id: actor.user.weddingId },
              { $inc: { expenseWriteVersion: 1 } },
              { session, returnDocument: 'after' },
            );
          if (!wedding)
            throw new HttpError(404, 'NOT_FOUND', 'Wedding not found.');
          const expense = await this.db
            .collection<ExpenseRecord>('expenses')
            .findOne(
              { _id: id, weddingId: wedding._id },
              { session, promoteLongs: false },
            );
          const events = await this.db
            .collection<EventRecord>('events')
            .find({ weddingId: wedding._id }, { session })
            .toArray();
          const members = await this.db
            .collection<UserRecord>('users')
            .find({ weddingId: wedding._id }, { session })
            .toArray();
          const next = work({ expense, events, members });
          if (!next._id.equals(id) || !next.weddingId.equals(wedding._id))
            throw new Error('Invalid expense scope.');
          if (next === expense) return next; // Authorised idempotency replay; no new audit/effect.
          await this.db
            .collection<ExpenseRecord>('expenses')
            .replaceOne({ _id: id, weddingId: wedding._id }, next, {
              session,
              upsert: true,
            });
          await this.db.collection('auditLogs').insertOne(
            {
              weddingId: wedding._id,
              actorType: 'user',
              actorId: actor.user._id,
              action,
              entityType: 'expense',
              entityId: id,
              timestamp: next.updatedAt,
              requestId,
              schemaVersion: 1,
              createdAt: next.updatedAt,
              updatedAt: next.updatedAt,
            },
            { session },
          );
          return next;
        },
        { readConcern: { level: 'snapshot' } },
      );
    } finally {
      await session.endSession();
    }
  }
}
