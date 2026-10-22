import { ObjectId, Long } from 'mongodb';
import { z } from 'zod';
import {
  expenseInputSchema,
  expensePatchSchema,
  paymentInputSchema,
  paymentPatchSchema,
  expenseIdSchema,
} from '@wedding-suite/shared/expenses';
import type { AuthSnapshot } from '../auth/auth.types.js';
import type {
  ExpenseRecord,
  ExpenseStore,
  ExpenseContext,
  PaymentRecord,
  ExpenseFilter,
} from './expenses.types.js';
import { HttpError } from '../../middleware/errors.js';
import { digest } from '../auth/auth.service.js';
import { objectId } from '../access/access.service.js';
export function expenseTotals(e: ExpenseRecord) {
  const cost = BigInt(e.costPaise.toString()),
    paid = e.payments.reduce(
      (n, p) => n + BigInt(p.amountPaise.toString()),
      0n,
    );
  return {
    costPaise: cost.toString(),
    paidPaise: paid.toString(),
    outstandingPaise: (cost > paid ? cost - paid : 0n).toString(),
    overpaidPaise: (paid > cost ? paid - cost : 0n).toString(),
  };
}
function safePayment(p: PaymentRecord) {
  return {
    id: p._id.toHexString(),
    amountPaise: p.amountPaise.toString(),
    paidByName: p.paidByName,
    paidByUserId: p.paidByUserId?.toHexString() ?? null,
    paymentDate: p.paymentDate,
    method: p.method,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}
export function safeExpense(e: ExpenseRecord) {
  const totals = expenseTotals(e);
  return {
    id: e._id.toHexString(),
    description: e.description,
    category: e.category,
    eventId: e.eventId?.toHexString() ?? null,
    vendorName: e.vendorName,
    notes: e.notes,
    currency: e.currency,
    revision: e.revision,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    ...totals,
    payments: e.payments.map(safePayment),
    warnings:
      BigInt(totals.overpaidPaise) > 0n
        ? ['OVERPAYMENT_RECORDED' as const]
        : [],
  };
}
const querySchema = z.strictObject({
  eventId: z.union([expenseIdSchema, z.literal('shared')]).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  payerName: z.string().trim().min(1).max(120).optional(),
  payerUserId: expenseIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(1500).optional(),
});
const missing = () => new HttpError(404, 'NOT_FOUND', 'Expense not available.');
export class ExpenseService {
  constructor(
    public store: ExpenseStore,
    private now = () => new Date(),
  ) {}
  async ready() {
    if (!(await this.store.ready()))
      throw new HttpError(
        503,
        'SERVICE_UNAVAILABLE',
        'Expenses are unavailable until the expense migration is applied.',
      );
  }
  private present(e: ExpenseRecord | null, revision?: number) {
    if (!e || e.archivedAt) throw missing();
    if (revision !== undefined && revision !== e.revision)
      throw new HttpError(
        412,
        'REVISION_CONFLICT',
        'This expense changed. Reload its latest version before saving. Your entries have been retained.',
      );
    return e;
  }
  private event(
    c: ExpenseContext,
    id: string | null,
    previous?: ObjectId | null,
  ) {
    if (
      id &&
      id !== previous?.toHexString() &&
      !c.events.some((e) => e._id.toHexString() === id && !e.archivedAt)
    )
      throw new HttpError(
        422,
        'INVALID_EVENT_SELECTION',
        'Choose an active ceremony from this wedding.',
      );
  }
  private payer(
    c: ExpenseContext,
    id: string | null,
    previous?: ObjectId | null,
  ) {
    if (
      id &&
      id !== previous?.toHexString() &&
      !c.members.some(
        (u) => u._id.toHexString() === id && u.status === 'active',
      )
    )
      throw new HttpError(
        422,
        'INVALID_PAYER',
        'Choose an active member of this wedding or enter a payer without an account.',
      );
  }
  async get(a: AuthSnapshot, id: string) {
    await this.ready();
    return safeExpense(
      this.present(await this.store.get(a.user.weddingId, objectId(id))),
    );
  }
  private query(a: AuthSnapshot, raw: unknown, kind: string) {
    const q = querySchema.parse(raw);
    const scope = digest(
      JSON.stringify([
        a.user.weddingId.toHexString(),
        kind,
        q.eventId ?? '',
        q.category ?? '',
        q.payerName ?? '',
        q.payerUserId ?? '',
      ]),
    );
    let after = '';
    if (q.cursor)
      try {
        const parsed = z
          .strictObject({
            scope: z.string(),
            after: z.string().regex(/^[a-f0-9]{24}(:[a-f0-9]{24})?$/),
          })
          .parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
        if (parsed.scope !== scope) throw new Error();
        after = parsed.after;
      } catch {
        throw new HttpError(
          400,
          'BAD_REQUEST',
          'Reload the list after changing filters.',
        );
      }
    return {
      q,
      after,
      cursor: (last: string) =>
        Buffer.from(JSON.stringify({ scope, after: last })).toString(
          'base64url',
        ),
    };
  }
  async list(a: AuthSnapshot, raw: unknown) {
    await this.ready();
    const { q, after, cursor } = this.query(a, raw, 'expenses'),
      rows = [];
    let more = false;
    for await (const e of this.store.scan(a.user.weddingId, q)) {
      if (after && e._id.toHexString() >= after) continue;
      if (rows.length === q.limit) {
        more = true;
        break;
      }
      rows.push(safeExpense(e));
    }
    return {
      items: rows,
      hasMore: more,
      nextCursor: more ? cursor(rows.at(-1)!.id) : null,
    };
  }
  async summary(a: AuthSnapshot, raw: unknown) {
    await this.ready();
    const q = querySchema.parse(raw),
      filter: ExpenseFilter = {
        ...(q.eventId ? { eventId: q.eventId } : {}),
        ...(q.category ? { category: q.category } : {}),
      };
    const sum = {
      currency: 'INR' as const,
      count: 0,
      costPaise: 0n,
      paidPaise: 0n,
      outstandingPaise: 0n,
      overpaidPaise: 0n,
    };
    for await (const e of this.store.scan(a.user.weddingId, filter)) {
      const t = expenseTotals(e);
      sum.count++;
      for (const key of [
        'costPaise',
        'paidPaise',
        'outstandingPaise',
        'overpaidPaise',
      ] as const)
        sum[key] += BigInt(t[key]);
    }
    return {
      ...sum,
      costPaise: String(sum.costPaise),
      paidPaise: String(sum.paidPaise),
      outstandingPaise: String(sum.outstandingPaise),
      overpaidPaise: String(sum.overpaidPaise),
    };
  }
  async payments(a: AuthSnapshot, raw: unknown) {
    await this.ready();
    const { q, after, cursor } = this.query(a, raw, 'payments'),
      rows = [];
    let total = 0n,
      last = '',
      more = false;
    for await (const e of this.store.scan(a.user.weddingId, q)) {
      for (const p of [...e.payments].sort((a, b) =>
        b._id.toHexString().localeCompare(a._id.toHexString()),
      )) {
        if (
          (q.payerName && p.paidByName !== q.payerName) ||
          (q.payerUserId && p.paidByUserId?.toHexString() !== q.payerUserId)
        )
          continue;
        total += BigInt(p.amountPaise.toString());
        const key = `${e._id}:${p._id}`;
        if (after && key >= after) continue;
        if (rows.length >= q.limit) {
          more = true;
          continue;
        }
        last = key;
        rows.push({
          ...safePayment(p),
          expenseId: e._id.toHexString(),
          description: e.description,
          category: e.category,
          eventId: e.eventId?.toHexString() ?? null,
        });
      }
    }
    return {
      items: rows,
      totalPaidPaise: String(total),
      hasMore: more,
      nextCursor: more ? cursor(last) : null,
    };
  }
  async create(a: AuthSnapshot, raw: unknown, rid = 'expense-service') {
    await this.ready();
    const input = expenseInputSchema.parse(raw),
      id = new ObjectId(),
      now = this.now();
    return safeExpense(
      await this.store.mutate(
        a,
        id,
        'expense.created',
        (c) => {
          this.event(c, input.eventId);
          return {
            ...input,
            _id: id,
            weddingId: a.user.weddingId,
            eventId: input.eventId ? new ObjectId(input.eventId) : null,
            costPaise: Long.fromString(input.costPaise),
            currency: 'INR',
            payments: [],
            paymentRequests: [],
            revision: 1,
            schemaVersion: 1,
            archivedAt: null,
            createdAt: now,
            updatedAt: now,
            createdBy: a.user._id,
            updatedBy: a.user._id,
          };
        },
        rid,
      ),
    );
  }
  async change(
    a: AuthSnapshot,
    id: string,
    revision: number,
    raw: unknown,
    rid = 'expense-service',
  ) {
    await this.ready();
    const input = expensePatchSchema.parse(raw);
    return safeExpense(
      await this.store.mutate(
        a,
        objectId(id),
        'expense.updated',
        (c) => {
          const e = this.present(c.expense, revision);
          if (input.eventId !== undefined)
            this.event(c, input.eventId, e.eventId);
          return {
            ...e,
            ...input,
            description: input.description ?? e.description,
            category: input.category ?? e.category,
            vendorName: input.vendorName ?? e.vendorName,
            notes: input.notes ?? e.notes,
            eventId:
              input.eventId === undefined
                ? e.eventId
                : input.eventId
                  ? new ObjectId(input.eventId)
                  : null,
            costPaise:
              input.costPaise === undefined
                ? e.costPaise
                : Long.fromString(input.costPaise),
            revision: e.revision + 1,
            updatedAt: this.now(),
            updatedBy: a.user._id,
          };
        },
        rid,
      ),
    );
  }
  async archive(
    a: AuthSnapshot,
    id: string,
    revision: number,
    rid = 'expense-service',
  ) {
    await this.ready();
    await this.store.mutate(
      a,
      objectId(id),
      'expense.archived',
      (c) => {
        const e = this.present(c.expense, revision);
        return {
          ...e,
          archivedAt: this.now(),
          updatedAt: this.now(),
          updatedBy: a.user._id,
          revision: e.revision + 1,
        };
      },
      rid,
    );
  }
  async payment(
    a: AuthSnapshot,
    id: string,
    revision: number,
    raw: unknown,
    key: string,
    rid = 'expense-service',
  ) {
    await this.ready();
    const input = paymentInputSchema.parse(raw);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new HttpError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Use a stable Idempotency-Key of 16–128 letters, digits, underscores or hyphens.',
      );
    const hash = digest(JSON.stringify(input));
    return safeExpense(
      await this.store.mutate(
        a,
        objectId(id),
        'expense.payment_added',
        (c) => {
          const e = this.present(c.expense),
            old = e.paymentRequests.find((r) => r.key === key);
          if (old) {
            if (old.hash !== hash)
              throw new HttpError(
                409,
                'IDEMPOTENCY_CONFLICT',
                'This payment retry key was already used with different details.',
              );
            return e;
          }
          this.present(e, revision);
          this.payer(c, input.paidByUserId);
          if (e.paymentRequests.length >= 500)
            throw new HttpError(
              409,
              'PAYMENT_LIMIT',
              'This expense has reached its 500 payment-operation limit.',
            );
          const p = {
            ...input,
            _id: new ObjectId(),
            amountPaise: Long.fromString(input.amountPaise),
            paidByUserId: input.paidByUserId
              ? new ObjectId(input.paidByUserId)
              : null,
            createdAt: this.now(),
            createdBy: a.user._id,
          };
          const next = {
            ...e,
            payments: [...e.payments, p],
            paymentRequests: [
              ...e.paymentRequests,
              { key, hash, paymentId: p._id },
            ],
            revision: e.revision + 1,
            updatedAt: this.now(),
            updatedBy: a.user._id,
          };
          this.bound(next);
          return next;
        },
        rid,
      ),
    );
  }
  private bound(e: ExpenseRecord) {
    if (BigInt(expenseTotals(e).paidPaise) > 9223372036854775807n)
      throw new HttpError(
        422,
        'AMOUNT_TOO_LARGE',
        'Total payments exceed the supported amount.',
      );
  }
  async editPayment(
    a: AuthSnapshot,
    id: string,
    pid: string,
    revision: number,
    raw: unknown,
    rid = 'expense-service',
  ) {
    await this.ready();
    const input = raw === null ? null : paymentPatchSchema.parse(raw),
      paymentId = objectId(pid);
    return safeExpense(
      await this.store.mutate(
        a,
        objectId(id),
        input ? 'expense.payment_updated' : 'expense.payment_removed',
        (c) => {
          const e = this.present(c.expense, revision),
            p = e.payments.find((p) => p._id.equals(paymentId));
          if (!p)
            throw new HttpError(404, 'NOT_FOUND', 'Payment not available.');
          if (input?.paidByUserId !== undefined)
            this.payer(c, input.paidByUserId, p.paidByUserId);
          const next = {
            ...e,
            payments: input
              ? e.payments.map((old) =>
                  old === p
                    ? {
                        ...old,
                        ...input,
                        paidByName: input.paidByName ?? old.paidByName,
                        paymentDate: input.paymentDate ?? old.paymentDate,
                        method: input.method ?? old.method,
                        notes: input.notes ?? old.notes,
                        paidByUserId:
                          input.paidByUserId === undefined
                            ? old.paidByUserId
                            : input.paidByUserId
                              ? new ObjectId(input.paidByUserId)
                              : null,
                        amountPaise:
                          input.amountPaise === undefined
                            ? old.amountPaise
                            : Long.fromString(input.amountPaise),
                      }
                    : old,
                )
              : e.payments.filter((old) => old !== p),
            revision: e.revision + 1,
            updatedAt: this.now(),
            updatedBy: a.user._id,
          };
          this.bound(next);
          return next;
        },
        rid,
      ),
    );
  }
}
