import {
  expenseListSchema,
  expenseResponseSchema,
  expenseSummarySchema,
  paymentListSchema,
} from '@wedding-suite/shared/expenses';
import type {
  ExpenseInput,
  PaymentInput,
} from '@wedding-suite/shared/expenses';
import { fetchJson } from '../../api/client.js';
export interface Filters {
  eventId: string;
  category: string;
  payerName: string;
}
function query(f: Filters, cursor?: string | null) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) q.set(k, v);
  if (cursor) q.set('cursor', cursor);
  return q;
}
const match = (n: number) => ({ 'If-Match': `"${n}"` });
export const list = async (
  f: Filters,
  cursor: string | null,
  signal: AbortSignal,
) =>
  expenseListSchema.parse(
    await fetchJson(`/api/v1/expenses?${query(f, cursor)}`, { signal }),
  );
export const summary = async (f: Filters, signal: AbortSignal) =>
  expenseSummarySchema.parse(
    await fetchJson(
      `/api/v1/expenses/summary?${query({ ...f, payerName: '' })}`,
      { signal },
    ),
  ).data;
export const payments = async (
  f: Filters,
  cursor: string | null,
  signal: AbortSignal,
) =>
  paymentListSchema.parse(
    await fetchJson(`/api/v1/expense-payments?${query(f, cursor)}`, { signal }),
  );
export const detail = async (id: string) =>
  expenseResponseSchema.parse(await fetchJson(`/api/v1/expenses/${id}`)).data;
export const save = async (
  input: ExpenseInput,
  e?: { id: string; revision: number },
) =>
  expenseResponseSchema.parse(
    await fetchJson(e ? `/api/v1/expenses/${e.id}` : '/api/v1/expenses', {
      method: e ? 'PATCH' : 'POST',
      ...(e ? { headers: match(e.revision) } : {}),
      body: JSON.stringify(input),
    }),
  ).data;
export const archive = (e: { id: string; revision: number }) =>
  fetchJson(`/api/v1/expenses/${e.id}`, {
    method: 'DELETE',
    headers: match(e.revision),
  });
export const savePayment = async (
  e: { id: string; revision: number },
  input: PaymentInput,
  key: string,
  pid?: string,
) =>
  expenseResponseSchema.parse(
    await fetchJson(
      `/api/v1/expenses/${e.id}/payments${pid ? '/' + pid : ''}`,
      {
        method: pid ? 'PATCH' : 'POST',
        headers: {
          ...match(e.revision),
          ...(!pid ? { 'Idempotency-Key': key } : {}),
        },
        body: JSON.stringify(input),
      },
    ),
  ).data;
export const removePayment = (
  e: { id: string; revision: number },
  pid: string,
) =>
  fetchJson(`/api/v1/expenses/${e.id}/payments/${pid}`, {
    method: 'DELETE',
    headers: match(e.revision),
  });
