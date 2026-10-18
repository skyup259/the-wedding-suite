import { authResponseSchema } from '@wedding-suite/shared/auth';
import type { LoginInput, RegisterInput } from '@wedding-suite/shared/auth';
import { ApiClientError, fetchJson } from '../../api/client.js';

export async function currentUser(signal: AbortSignal) {
  try {
    return authResponseSchema.parse(
      await fetchJson('/api/v1/auth/me', { signal }),
    ).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}
export async function login(input: LoginInput) {
  return authResponseSchema.parse(
    await fetchJson('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  ).data;
}
export async function signup(input: RegisterInput) {
  return authResponseSchema.parse(
    await fetchJson('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  ).data;
}
export async function logout() {
  await fetchJson('/api/v1/auth/logout', { method: 'POST' });
}
