import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from './http.js';
import { themeIdSchema } from './themes.js';

describe('shared contracts', () => {
  it('rejects malformed health and error responses', () => {
    expect(
      healthResponseSchema.safeParse({ data: { status: 'connected' } }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({ error: { message: 'Missing code' } }).success,
    ).toBe(false);
  });

  it('accepts the documented error envelope and exactly three theme identifiers', () => {
    expect(
      apiErrorSchema.parse({
        error: { code: 'NOT_FOUND', message: 'Not found.' },
        meta: { requestId: 'request-1' },
      }).error.code,
    ).toBe('NOT_FOUND');
    expect(themeIdSchema.options).toEqual(['traditional', 'floral', 'minimal']);
    expect(themeIdSchema.safeParse('custom').success).toBe(false);
  });
});
