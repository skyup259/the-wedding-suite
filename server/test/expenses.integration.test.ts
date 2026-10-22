import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { ObjectId, Long } from 'mongodb';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { migrateWebsite } from '../src/migrations/003-wedding-events.js';
import { migrateExpenses } from '../src/migrations/006-expenses-payments.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { MongoExpenseStore } from '../src/modules/expenses/expenses.repository.js';
import { ExpenseService } from '../src/modules/expenses/expenses.service.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { MongoWebsiteStore } from '../src/modules/website/website.repository.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>,
  auth: AuthService,
  store: MongoExpenseStore,
  service: ExpenseService,
  website: WebsiteService;
const input = {
    description: 'Test photography',
    category: 'Photography',
    eventId: null,
    vendorName: 'Test vendor',
    notes: 'Preserved notes',
    costPaise: '8000000',
  },
  payment = {
    amountPaise: '2000000',
    paidByName: 'Test payer',
    paidByUserId: null,
    paymentDate: '2026-10-22',
    method: 'bank_transfer',
    notes: 'Preserved payment notes',
  };
beforeAll(async () => {
  db = await createTestDatabase();
  await migrateAuth(db.db);
  await migrateWebsite(db.db);
  await migrateExpenses(db.db);
  auth = await createAuthService(new MongoAuthStore(db.client, db.db));
  store = new MongoExpenseStore(db.client, db.db);
  service = new ExpenseService(store);
  website = new WebsiteService(new MongoWebsiteStore(db.client, db.db));
});
afterAll(async () => {
  if (db) await db.cleanup();
});
async function setup() {
  const result = await auth.register({
    email: `expense-${new ObjectId()}@example.test`,
    password: 'a synthetic Atlas expense passphrase',
    displayName: 'Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  return (await auth.resolve(result.token))!;
}
const ceremony = {
  name: 'Test ceremony',
  description: '',
  startAt: '2026-12-31T10:00:00.000Z',
  endAt: null,
  venue: { name: 'Test venue', address: 'Synthetic venue', mapUrl: '' },
  contacts: [{ name: 'Organiser', phone: '+919000000000' }],
  dressCode: '',
  instructions: '',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
};
describe('Atlas expenses/payments', () => {
  it('migrates idempotently, enforces BSON Long/schema/indexes and preserves exact large values', async () => {
    await migrateExpenses(db.db);
    expect(await store.ready()).toBe(true);
    expect(
      (await db.db.collection('expenses').indexes()).map((i) => i.name),
    ).toContain('expense_event');
    await expect(
      db.db.collection('expenses').insertOne({ weddingId: new ObjectId() }),
    ).rejects.toMatchObject({ code: 121 });
    const a = await setup(),
      e = await service.create(a, {
        ...input,
        costPaise: '900719925474099301',
      });
    expect(e.costPaise).toBe('900719925474099301');
    expect(
      await db.db.collection('expenses').countDocuments({
        _id: new ObjectId(e.id),
        costPaise: { $type: 'long' },
      }),
    ).toBe(1);
    await expect(
      db.db
        .collection('expenses')
        .updateOne({ _id: new ObjectId(e.id) }, { $set: { costPaise: 1.1 } }),
    ).rejects.toMatchObject({ code: 121 });
    expect((await service.summary(a, {})).costPaise).toBe(e.costPaise);
  });
  it('reconciles PRD payments, preserves omitted patch fields, handles overpayment separately and archives', async () => {
    const a = await setup();
    let e = await service.create(a, input);
    e = await service.payment(a, e.id, 1, payment, 'atlas-payment-operation-1');
    e = await service.payment(
      a,
      e.id,
      2,
      { ...payment, amountPaise: '3000000' },
      'atlas-payment-operation-2',
    );
    expect(e).toMatchObject({
      paidPaise: '5000000',
      outstandingPaise: '3000000',
    });
    e = await service.change(a, e.id, 3, { description: 'Changed' });
    expect(e).toMatchObject({
      notes: input.notes,
      vendorName: input.vendorName,
    });
    e = await service.editPayment(a, e.id, e.payments[0]!.id, 4, {
      amountPaise: '6000000',
    });
    expect(e.payments[0]).toMatchObject({
      method: payment.method,
      notes: payment.notes,
    });
    expect(e.overpaidPaise).toBe('1000000');
    await service.create(a, { ...input, costPaise: '1000' });
    expect(await service.summary(a, {})).toMatchObject({
      outstandingPaise: '1000',
      overpaidPaise: '1000000',
    });
    await service.archive(a, e.id, 5);
    expect((await service.summary(a, {})).count).toBe(1);
  });
  it('serializes concurrent payment retries and competing revisions; retains replay identity after deletion', async () => {
    const a = await setup(),
      e = await service.create(a, input);
    const sends = await Promise.all([
      service.payment(a, e.id, 1, payment, 'atlas-payment-operation-1'),
      service.payment(a, e.id, 1, payment, 'atlas-payment-operation-1'),
    ]);
    expect(sends[0].payments[0]!.id).toBe(sends[1].payments[0]!.id);
    const edits = await Promise.allSettled([
      service.change(a, e.id, 2, { notes: 'one' }),
      service.change(a, e.id, 2, { notes: 'two' }),
    ]);
    expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await service.editPayment(a, e.id, sends[0].payments[0]!.id, 3, null);
    expect(
      (await service.payment(a, e.id, 1, payment, 'atlas-payment-operation-1'))
        .payments,
    ).toHaveLength(0);
    await expect(
      service.payment(
        a,
        e.id,
        1,
        { ...payment, amountPaise: '1' },
        'atlas-payment-operation-1',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(
      await db.db.collection('auditLogs').countDocuments({
        entityId: new ObjectId(e.id),
        action: 'expense.payment_added',
      }),
    ).toBe(1);
  });
  it('rolls back late audit failure and refuses sums exceeding the supported Long range', async () => {
    const a = await setup(),
      e = await service.create(a, input);
    await expect(
      service.payment(
        a,
        e.id,
        1,
        payment,
        'atlas-payment-operation-1',
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect((await service.get(a, e.id)).payments).toHaveLength(0);
    await service.payment(
      a,
      e.id,
      1,
      { ...payment, amountPaise: Long.MAX_VALUE.toString() },
      'atlas-payment-operation-1',
    );
    await expect(
      service.payment(
        a,
        e.id,
        2,
        { ...payment, amountPaise: '1' },
        'atlas-payment-operation-2',
      ),
    ).rejects.toMatchObject({ code: 'AMOUNT_TOO_LARGE' });
    expect((await service.get(a, e.id)).revision).toBe(2);
  });
  it('denies foreign IDs/selections, permits Manager writes and rechecks disabled authority even on replay', async () => {
    const a = await setup(),
      b = await setup(),
      e = await service.create(a, input),
      event = await website.event(a, ceremony);
    await expect(service.get(b, e.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.create(b, { ...input, eventId: event.id }),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_SELECTION' });
    await expect(
      service.payment(
        a,
        e.id,
        1,
        { ...payment, paidByUserId: b.user._id.toHexString() },
        'atlas-payment-operation-1',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAYER' });
    const manager = {
      ...a.user,
      _id: new ObjectId(),
      emailNormalized: `manager-${new ObjectId()}@example.test`,
      role: 'manager' as const,
    };
    await db.db.collection('users').insertOne(manager);
    const actor = { user: manager, wedding: a.wedding };
    await service.payment(actor, e.id, 1, payment, 'atlas-payment-operation-1');
    await db.db
      .collection('users')
      .updateOne({ _id: manager._id }, { $set: { status: 'disabled' } });
    await expect(
      service.payment(actor, e.id, 1, payment, 'atlas-payment-operation-1'),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('keeps ceremony history after confirmed archive, scopes cursors and reports payer amounts correctly', async () => {
    const a = await setup(),
      event = await website.event(a, ceremony);
    let e = await service.create(a, { ...input, eventId: event.id });
    await expect(website.archive(a, event.id, 1, false)).rejects.toMatchObject({
      code: 'RESOURCE_REFERENCED',
    });
    await website.archive(a, event.id, 1, true);
    e = await service.change(a, e.id, 1, {
      description: 'History retained',
      eventId: event.id,
    });
    e = await service.payment(a, e.id, 2, payment, 'atlas-payment-operation-1');
    await service.payment(
      a,
      e.id,
      3,
      { ...payment, paidByName: 'Other payer', amountPaise: '3000000' },
      'atlas-payment-operation-2',
    );
    await service.create(a, input);
    await service.create(a, input);
    const first = await service.list(a, { limit: 2 }),
      second = await service.list(a, { limit: 2, cursor: first.nextCursor });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(
      new Set([...first.items, ...second.items].map((e) => e.id)).size,
    ).toBe(3);
    await expect(
      service.list(a, { category: 'different', cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const report = await service.payments(a, { payerName: 'Test payer' });
    expect(report.totalPaidPaise).toBe('2000000');
    expect(report.items).toHaveLength(1);
    expect(
      (await service.list(a, { payerName: 'Test payer' })).items[0]!.paidPaise,
    ).toBe('5000000');
    expect((await service.list(a, { eventId: 'shared' })).items).toHaveLength(
      2,
    );
  });
});
