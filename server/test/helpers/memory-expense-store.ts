import { BSON } from 'mongodb';
import type { ObjectId } from 'mongodb';
import type { AuthSnapshot } from '../../src/modules/auth/auth.types.js';
import type {
  ExpenseStore,
  ExpenseRecord,
  ExpenseFilter,
  ExpenseContext,
} from '../../src/modules/expenses/expenses.types.js';
import type { MemoryWebsiteStore } from './memory-website-store.js';
import { HttpError } from '../../src/middleware/errors.js';
const clone = <T>(v: T): T =>
  BSON.deserialize(BSON.serialize({ v }), { promoteLongs: false }).v as T;
export class MemoryExpenseStore implements ExpenseStore {
  migrated = true;
  failAudit = false;
  records = new Map<string, ExpenseRecord>();
  audits: string[] = [];
  private lock: Promise<void> = Promise.resolve();
  constructor(public website: MemoryWebsiteStore) {}
  async ready() {
    return this.migrated;
  }
  async get(w: ObjectId, id: ObjectId) {
    const e = this.records.get(id.toHexString());
    return e?.weddingId.equals(w) && !e.archivedAt ? clone(e) : null;
  }
  async *scan(w: ObjectId, f: ExpenseFilter) {
    for (const e of [...this.records.values()].sort((a, b) =>
      b._id.toHexString().localeCompare(a._id.toHexString()),
    )) {
      if (!e.weddingId.equals(w) || e.archivedAt) continue;
      if (
        f.eventId &&
        (f.eventId === 'shared'
          ? e.eventId !== null
          : e.eventId?.toHexString() !== f.eventId)
      )
        continue;
      if (f.category && e.category !== f.category) continue;
      if (
        (f.payerName || f.payerUserId) &&
        !e.payments.some(
          (p) =>
            (!f.payerName || p.paidByName === f.payerName) &&
            (!f.payerUserId || p.paidByUserId?.toHexString() === f.payerUserId),
        )
      )
        continue;
      yield clone(e);
    }
  }
  async mutate(
    a: AuthSnapshot,
    id: ObjectId,
    action: string,
    work: (c: ExpenseContext) => ExpenseRecord,
  ) {
    const prior = this.lock;
    let release = () => {};
    this.lock = new Promise<void>((r) => {
      release = r;
    });
    await prior;
    try {
      const u = this.website.auth.users.get(a.user._id.toHexString());
      if (
        !u ||
        !u.weddingId.equals(a.user.weddingId) ||
        u.status !== 'active' ||
        u.role !== a.user.role ||
        u.sessionVersion !== a.user.sessionVersion
      )
        throw new HttpError(401, 'SESSION_EXPIRED', 'Please sign in again.');
      const e = this.records.get(id.toHexString());
      const current = e?.weddingId.equals(a.user.weddingId) ? clone(e) : null;
      const next = work({
        expense: current,
        events: [...this.website.events.values()].filter((e) =>
          e.weddingId.equals(a.user.weddingId),
        ),
        members: [...this.website.auth.users.values()].filter((u) =>
          u.weddingId.equals(a.user.weddingId),
        ),
      });
      if (next === current) return next;
      if (this.failAudit) throw new Error('Synthetic audit failure');
      this.records.set(id.toHexString(), clone(next));
      this.audits.push(action);
      return clone(next);
    } finally {
      release();
    }
  }
}
