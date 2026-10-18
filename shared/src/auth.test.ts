import { describe, expect, it } from 'vitest';
import { registerSchema, loginSchema } from './auth.js';

describe('authentication contracts', () => {
  it('normalises email and leaves password whitespace intact', () => {
    const result = loginSchema.parse({
      email: ' User@Example.Test ',
      password: ' space sensitive ',
    });
    expect(result.email).toBe('user@example.test');
    expect(result.password).toBe(' space sensitive ');
  });
  it('rejects arbitrary ownership fields and impossible calendar dates/timezones', () => {
    const input = {
      email: 'person@example.test',
      displayName: 'Person',
      password: 'a long enough passphrase',
      wedding: {
        couple: { partner1Name: 'A', partner2Name: 'B' },
        mainDate: '2026-02-30',
        timezone: 'Not/A_Zone',
        themeId: 'traditional',
      },
    };
    const result = registerSchema.safeParse({
      ...input,
      weddingId: 'not-client-controlled',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((i) => i.path.join('.'))).toEqual(
        expect.arrayContaining(['wedding.mainDate', 'wedding.timezone']),
      );
  });
});
