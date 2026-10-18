import { apiErrorSchema } from '@wedding-suite/shared/http';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export async function fetchJson(
  path: `/api/${string}`,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...Object.fromEntries(new Headers(options.headers)),
    },
  });
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
    );
  }
  return json;
}
