import { afterEach, expect, it, vi } from 'vitest';
import { fetchJson } from './client.js';

afterEach(() => vi.unstubAllGlobals());
it('obtains CSRF protection for writes, sends cookies and accepts a bodyless logout', async () => {
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        data: { csrfToken: 'synthetic-token' },
        meta: { requestId: 'request-1' },
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', mock);
  expect(
    await fetchJson('/api/v1/auth/logout', { method: 'POST' }),
  ).toBeUndefined();
  expect(mock.mock.calls[0]?.[0]).toBe('/api/v1/auth/csrf');
  const options = mock.mock.calls[1]?.[1] as RequestInit;
  expect(options.credentials).toBe('same-origin');
  expect(new Headers(options.headers).get('X-CSRF-Token')).toBe(
    'synthetic-token',
  );
});
