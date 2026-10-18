import { apiErrorSchema } from '@wedding-suite/shared/http';
import { csrfResponseSchema } from '@wedding-suite/shared/auth';
import type { ApiErrorResponse } from '@wedding-suite/shared/http';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fields?: ApiErrorResponse['error']['fields'],
  ) {
    super(message);
  }
}

export async function fetchJson(
  path: `/api/${string}`,
  options: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(
      (options.method ?? 'GET').toUpperCase(),
    )
  ) {
    const csrf = csrfResponseSchema.parse(
      await fetchJson('/api/v1/auth/csrf', {
        ...(options.signal ? { signal: options.signal } : {}),
      }),
    );
    headers.set('X-CSRF-Token', csrf.data.csrfToken);
  }
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers,
  });
  if (response.status === 204) return undefined;
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    throw new ApiClientError(
      response.status,
      parsed.success ? parsed.data.error.code : 'INVALID_RESPONSE',
      parsed.success
        ? parsed.data.error.message
        : 'Service returned an unexpected response.',
      parsed.success ? parsed.data.meta.requestId : undefined,
      parsed.success ? parsed.data.error.fields : undefined,
    );
  }
  return json;
}
