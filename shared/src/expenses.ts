import { z } from 'zod';
import { responseMetaSchema } from './http.js';
export const expenseIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const moneySchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .refine(
    (v) => /^[0-9]{1,19}$/.test(v) && BigInt(v) <= 9223372036854775807n,
    'Amount is too large.',
  );
const total = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const expenseInputSchema = z.strictObject({
  description: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  eventId: expenseIdSchema.nullable(),
  vendorName: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(2000).default(''),
  costPaise: moneySchema,
});
export const expensePatchSchema = expenseInputSchema
  .extend({
    vendorName: z.string().trim().max(160),
    notes: z.string().trim().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Enter a change.');
const calendarDate = z.iso.date().refine((v) => {
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Use a valid calendar date.');
export const paymentInputSchema = z.strictObject({
  amountPaise: moneySchema.refine(
    (v) => /^[0-9]{1,19}$/.test(v) && BigInt(v) > 0n,
    'Payment must be greater than zero.',
  ),
  paidByName: z.string().trim().min(1).max(120),
  paidByUserId: expenseIdSchema.nullable().default(null),
  paymentDate: calendarDate,
  method: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(2000).default(''),
});
export const paymentPatchSchema = paymentInputSchema
  .extend({
    paidByUserId: expenseIdSchema.nullable(),
    method: z.string().trim().max(80),
    notes: z.string().trim().max(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Enter a change.');
export const paymentSchema = paymentInputSchema.extend({
  id: expenseIdSchema,
  createdAt: z.iso.datetime(),
});
export const expenseSchema = expenseInputSchema.extend({
  id: expenseIdSchema,
  currency: z.literal('INR'),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  payments: z.array(paymentSchema),
  paidPaise: total,
  outstandingPaise: total,
  overpaidPaise: total,
  warnings: z.array(z.literal('OVERPAYMENT_RECORDED')),
});
export const expenseResponseSchema = z.object({
  data: expenseSchema,
  meta: responseMetaSchema,
});
const pageMeta = responseMetaSchema.extend({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export const expenseListSchema = z.object({
  data: z.array(expenseSchema),
  meta: pageMeta,
});
export const expenseSummarySchema = z.object({
  data: z.object({
    currency: z.literal('INR'),
    count: z.number().int().nonnegative(),
    costPaise: total,
    paidPaise: total,
    outstandingPaise: total,
    overpaidPaise: total,
  }),
  meta: responseMetaSchema,
});
export const paymentListSchema = z.object({
  data: z.array(
    paymentSchema.extend({
      expenseId: expenseIdSchema,
      description: z.string(),
      category: z.string(),
      eventId: expenseIdSchema.nullable(),
    }),
  ),
  meta: pageMeta.extend({ totalPaidPaise: total }),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>['data'];
// Decimal INR conversion without passing monetary values through floating point.
export function rupeesToPaise(value: string) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))
    throw new Error(
      'Enter a nonnegative INR amount with at most two decimal places.',
    );
  const [whole, fraction = ''] = value.split('.');
  return moneySchema.parse(
    (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))).toString(),
  );
}
export function paiseToRupees(value: string) {
  const n = BigInt(value);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`;
}
export function formatINR(value: string) {
  const n = BigInt(value);
  return `₹${new Intl.NumberFormat('en-IN').format(n / 100n)}.${(n % 100n).toString().padStart(2, '0')}`;
}
