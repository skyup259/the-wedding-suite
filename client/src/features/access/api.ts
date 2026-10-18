import {
  membersResponseSchema,
  invitationsResponseSchema,
} from '@wedding-suite/shared/access';
import { authResponseSchema } from '@wedding-suite/shared/auth';
import { fetchJson } from '../../api/client.js';
export const requestReset = (email: string) =>
  fetchJson('/api/v1/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
export const confirmReset = (token: string, newPassword: string) =>
  fetchJson('/api/v1/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
export async function acceptManager(
  token: string,
  displayName: string,
  password: string,
) {
  return authResponseSchema.parse(
    await fetchJson('/api/v1/auth/manager-invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token, displayName, password }),
    }),
  ).data;
}
export async function members(
  signal: AbortSignal,
  cursor: string | null = null,
) {
  return membersResponseSchema.parse(
    await fetchJson(
      `/api/v1/team${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal },
    ),
  );
}
export async function invitations(
  signal: AbortSignal,
  cursor: string | null = null,
) {
  return invitationsResponseSchema.parse(
    await fetchJson(
      `/api/v1/team/invitations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      { signal },
    ),
  );
}
export const invite = (email: string, displayName: string) =>
  fetchJson('/api/v1/team/invitations', {
    method: 'POST',
    body: JSON.stringify({
      email,
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    }),
  });
export const resend = (id: string, revision: number) =>
  fetchJson(`/api/v1/team/invitations/${id}/resend`, {
    method: 'POST',
    headers: { 'If-Match': `"${revision}"` },
  });
export const revoke = (id: string, revision: number) =>
  fetchJson(`/api/v1/team/invitations/${id}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${revision}"` },
  });
export const changeMember = (
  id: string,
  revision: number,
  status: 'active' | 'disabled',
) =>
  fetchJson(`/api/v1/team/${id}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${revision}"` },
    body: JSON.stringify({ status }),
  });
