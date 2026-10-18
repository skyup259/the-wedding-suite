import {
  invitationResponseSchema,
  invitationRotationResponseSchema,
  invitationListResponseSchema,
  shareResponseSchema,
  estimateResponseSchema,
  personalInvitationResponseSchema,
} from '@wedding-suite/shared/invitations';
import type { InvitationInput } from '@wedding-suite/shared/invitations';
import { fetchJson, ApiClientError } from '../../api/client.js';
import { apiErrorSchema } from '@wedding-suite/shared/http';
export interface Filters {
  search: string;
  sentStatus: string;
  eventId: string;
}
const match = (revision: number) => ({ 'If-Match': `"${revision}"` });
export const list = async (
  filters: Filters,
  cursor: string | null,
  signal: AbortSignal,
) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) query.set(key, value);
  if (cursor) query.set('cursor', cursor);
  return invitationListResponseSchema.parse(
    await fetchJson(`/api/v1/invitations?${query}`, { signal }),
  );
};
export const estimates = async (signal: AbortSignal) =>
  estimateResponseSchema.parse(
    await fetchJson('/api/v1/attendance-estimates', { signal }),
  ).data;
export const detail = async (id: string) =>
  invitationResponseSchema.parse(await fetchJson(`/api/v1/invitations/${id}`))
    .data;
export const save = async (
  input: InvitationInput,
  id?: string,
  revision?: number,
) =>
  invitationResponseSchema.parse(
    await fetchJson(id ? `/api/v1/invitations/${id}` : '/api/v1/invitations', {
      method: id ? 'PATCH' : 'POST',
      ...(revision ? { headers: match(revision) } : {}),
      body: JSON.stringify(input),
    }),
  ).data;
export const change = async (
  id: string,
  revision: number,
  action: 'sent-status' | 'rotate-link' | 'archive',
  sentStatus?: 'sent' | 'not_sent',
) => {
  const data = await fetchJson(
    `/api/v1/invitations/${id}${action === 'archive' ? '' : '/' + action}`,
    {
      method: action === 'archive' ? 'DELETE' : 'POST',
      headers: match(revision),
      ...(sentStatus ? { body: JSON.stringify({ sentStatus }) } : {}),
    },
  );
  return action === 'archive'
    ? null
    : action === 'rotate-link'
      ? invitationRotationResponseSchema.parse(data).data
      : invitationResponseSchema.parse(data).data;
};
export const share = async (id: string) =>
  shareResponseSchema.parse(
    await fetchJson(`/api/v1/invitations/${id}/share-link`, { method: 'POST' }),
  ).data;
export const personal = async (
  slug: string,
  token: string,
  signal: AbortSignal,
) => {
  // Public read capability: no session, CSRF establishment or token-bearing query/cache key.
  const res = await fetch(
    `/api/v1/public/weddings/${encodeURIComponent(slug)}/invitation-view`,
    {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal,
    },
  );
  const json: unknown = await res.json();
  if (!res.ok) {
    const error = apiErrorSchema.safeParse(json);
    throw new ApiClientError(
      res.status,
      error.success ? error.data.error.code : 'INVALID_RESPONSE',
      error.success ? error.data.error.message : 'Unable to load invitation.',
    );
  }
  return personalInvitationResponseSchema.parse(json).data;
};
