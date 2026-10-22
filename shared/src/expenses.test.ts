import { describe, it, expect } from 'vitest';
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  moneySchema,
  paymentInputSchema,
  expensePatchSchema,
} from './expenses.js';
describe('exact INR contracts', () => {
  it('round trips values beyond safe JS numbers without losing a paise', () => {
    expect(rupeesToPaise('80000.01')).toBe('8000001');
    expect(paiseToRupees('900719925474099301')).toBe('9007199254740993.01');
    expect(rupeesToPaise('9007199254740993.01')).toBe('900719925474099301');
    expect(formatINR('8000000')).toBe('₹80,000.00');
  });
  it.each(['-1', '1.001', '1e3', '1,000', 'NaN', '01.00', ''])(
    'rejects invalid INR %s',
    (v) => {
      expect(() => rupeesToPaise(v)).toThrow();
    },
  );
  it('rejects overflowing money, zero payments and impossible dates', () => {
    expect(moneySchema.safeParse('9223372036854775808').success).toBe(false);
    for (const paymentDate of ['2026-02-30', '2026-13-01'])
      expect(
        paymentInputSchema.safeParse({
          amountPaise: '1',
          paidByName: 'Test',
          paymentDate,
        }).success,
      ).toBe(false);
    expect(
      paymentInputSchema.safeParse({
        amountPaise: '0',
        paidByName: 'Test',
        paymentDate: '2026-10-22',
      }).success,
    ).toBe(false);
    expect(expensePatchSchema.safeParse({ payments: [] }).success).toBe(false);
    expect(expensePatchSchema.safeParse({}).success).toBe(false);
    expect(moneySchema.safeParse('1.2').success).toBe(false);
    expect(expensePatchSchema.parse({ description: 'Changed' })).toEqual({
      description: 'Changed',
    });
  });
});
