import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryWebsiteStore } from './helpers/memory-website-store.js';
import { MemoryExpenseStore } from './helpers/memory-expense-store.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import type { AuthSnapshot } from '../src/modules/auth/auth.types.js';
import { ExpenseService } from '../src/modules/expenses/expenses.service.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
const input = {
  description: 'Photography',
  category: 'Photography',
  eventId: null,
  vendorName: 'Test vendor',
  notes: '',
  costPaise: '8000000',
};
const payment = {
  amountPaise: '2000000',
  paidByName: 'Test payer',
  paidByUserId: null,
  paymentDate: '2026-10-22',
  method: 'bank_transfer',
  notes: '',
};
let auth: AuthService,
  store: MemoryExpenseStore,
  service: ExpenseService,
  actor: AuthSnapshot,
  token: string;
async function register() {
  const result = await auth.register({
    email: `expense-${new ObjectId()}@example.test`,
    password: 'a synthetic expense passphrase',
    displayName: 'Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  return { actor: (await auth.resolve(result.token))!, token: result.token };
}
beforeEach(async () => {
  auth = await createAuthService(new MemoryAuthStore());
  store = new MemoryExpenseStore(
    new MemoryWebsiteStore(auth.store as MemoryAuthStore),
  );
  service = new ExpenseService(store);
  ({ actor, token } = await register());
});
describe('expenses and payments', () => {
  it('reconciles the PRD example, payment edits/removal, archive and exact large values', async () => {
    let e = await service.create(actor, input);
    e = await service.payment(actor, e.id, 1, payment, 'payment-operation-1');
    e = await service.payment(
      actor,
      e.id,
      2,
      { ...payment, amountPaise: '3000000' },
      'payment-operation-2',
    );
    expect(e).toMatchObject({
      paidPaise: '5000000',
      outstandingPaise: '3000000',
      overpaidPaise: '0',
    });
    e = await service.editPayment(actor, e.id, e.payments[0]!.id, 3, {
      amountPaise: '6000000',
    });
    expect(e).toMatchObject({
      paidPaise: '9000000',
      outstandingPaise: '0',
      overpaidPaise: '1000000',
      warnings: ['OVERPAYMENT_RECORDED'],
    });
    e = await service.editPayment(actor, e.id, e.payments[0]!.id, 4, null);
    expect(e.paidPaise).toBe('3000000');
    await service.create(actor, { ...input, costPaise: '900719925474099301' });
    expect((await service.summary(actor, {})).costPaise).toBe(
      '900719925482099301',
    );
    await service.archive(actor, e.id, 5);
    await expect(service.get(actor, e.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('replays before stale revisions, conflicts on changed payload and never resurrects an edited/deleted payment', async () => {
    let e = await service.create(actor, input);
    e = await service.payment(actor, e.id, 1, payment, 'payment-operation-1');
    expect(
      (await service.payment(actor, e.id, 1, payment, 'payment-operation-1'))
        .payments,
    ).toHaveLength(1);
    await expect(
      service.payment(
        actor,
        e.id,
        1,
        { ...payment, notes: 'changed' },
        'payment-operation-1',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await service.editPayment(actor, e.id, e.payments[0]!.id, 2, null);
    expect(
      (await service.payment(actor, e.id, 1, payment, 'payment-operation-1'))
        .payments,
    ).toHaveLength(0);
    expect(store.audits).toHaveLength(3);
  });
  it('does not offset another expense with overpayment; payer report counts only that payer', async () => {
    let e = await service.create(actor, { ...input, costPaise: '100' });
    await service.payment(
      actor,
      e.id,
      1,
      { ...payment, amountPaise: '200' },
      'payment-operation-1',
    );
    e = await service.create(actor, {
      ...input,
      costPaise: '1000',
      category: 'Venue',
    });
    e = await service.payment(
      actor,
      e.id,
      1,
      { ...payment, paidByName: 'Another payer', amountPaise: '300' },
      'payment-operation-2',
    );
    await service.payment(
      actor,
      e.id,
      2,
      { ...payment, amountPaise: '100' },
      'payment-operation-3',
    );
    expect(await service.summary(actor, {})).toMatchObject({
      costPaise: '1100',
      paidPaise: '600',
      outstandingPaise: '600',
      overpaidPaise: '100',
    });
    const report = await service.payments(actor, {
      payerName: 'Test payer',
      limit: 1,
    });
    expect(report.totalPaidPaise).toBe('300');
    expect(report.hasMore).toBe(true);
    const rest = await service.payments(actor, {
      payerName: 'Test payer',
      limit: 1,
      cursor: report.nextCursor,
    });
    expect(rest.items[0]!.id).not.toBe(report.items[0]!.id);
    await expect(
      service.payments(actor, {
        payerName: 'Another payer',
        cursor: report.nextCursor,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('denies wrong wedding IDs, foreign events/payers, stale edits and disabled actors; rolls back audit failures', async () => {
    const e = await service.create(actor, input),
      other = (await register()).actor;
    await expect(service.get(other, e.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.change(other, e.id, 1, { notes: 'intrusion' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.create(actor, {
        ...input,
        eventId: new ObjectId().toHexString(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_SELECTION' });
    await expect(
      service.payment(
        actor,
        e.id,
        1,
        { ...payment, paidByUserId: other.user._id.toHexString() },
        'payment-operation-1',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PAYER' });
    store.failAudit = true;
    await expect(
      service.change(actor, e.id, 1, { notes: 'rollback' }),
    ).rejects.toThrow('Synthetic audit failure');
    expect((await service.get(actor, e.id)).revision).toBe(1);
    store.failAudit = false;
    const result = await Promise.allSettled([
      service.change(actor, e.id, 1, { notes: 'one' }),
      service.change(actor, e.id, 1, { notes: 'two' }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    store.website.auth.users.get(actor.user._id.toHexString())!.status =
      'disabled';
    await expect(
      service.payment(actor, e.id, 2, payment, 'payment-operation-1'),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('protects routes with auth, CSRF and If-Match; validates money and returns safe schemas', async () => {
    const app = createApp({
      logger: createLogger('silent'),
      checkReady: async () => {},
      expenses: service,
      auth: {
        service: auth,
        options: {
          origin: 'http://localhost:5173',
          secure: false,
          csrfSecret: 'synthetic-expense-secret-at-least-32',
        },
      },
    });
    expect((await request(app).get('/api/v1/expenses')).status).toBe(401);
    const agent = request.agent(app);
    agent.jar.setCookie(`ws_session=${token}`);
    const csrf = await agent.get('/api/v1/auth/csrf');
    const headers = {
      Origin: 'http://localhost:5173',
      'X-CSRF-Token': csrf.body.data.csrfToken,
    };
    expect((await agent.post('/api/v1/expenses').send(input)).status).toBe(403);
    const created = await agent
      .post('/api/v1/expenses')
      .set(headers)
      .send(input);
    expect(created.status).toBe(201);
    expect(created.headers.etag).toBe('"1"');
    const id = created.body.data.id;
    expect(
      (
        await agent
          .patch(`/api/v1/expenses/${id}`)
          .set(headers)
          .send({ notes: 'x' })
      ).status,
    ).toBe(428);
    expect(
      (
        await agent
          .post(`/api/v1/expenses/${id}/payments`)
          .set(headers)
          .set('If-Match', '"1"')
          .send(payment)
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .post('/api/v1/expenses')
          .set(headers)
          .send({ ...input, costPaise: 0.1 })
      ).status,
    ).toBe(422);
    store.migrated = false;
    expect((await agent.get('/api/v1/expenses')).status).toBe(503);
  });
});
