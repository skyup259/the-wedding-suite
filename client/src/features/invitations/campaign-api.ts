import {
  emailBatchResponseSchema,
  emailBatchListSchema,
  emailDispatchResponseSchema,
} from '@wedding-suite/shared/campaigns';
import { fetchJson } from '../../api/client.js';
const match = (revision: number) => ({ 'If-Match': `"${revision}"` });
export const batches = async (cursor: string | null, signal: AbortSignal) =>
  emailBatchListSchema.parse(
    await fetchJson(
      `/api/v1/email-batches${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
      { signal },
    ),
  );
export const previewEmail = async (invitationIds: string[]) =>
  emailBatchResponseSchema.parse(
    await fetchJson('/api/v1/email-batches/preview', {
      method: 'POST',
      body: JSON.stringify({ invitationIds }),
    }),
  ).data;
export const getBatch = async (id: string, signal: AbortSignal) =>
  emailBatchResponseSchema.parse(
    await fetchJson(`/api/v1/email-batches/${id}`, { signal }),
  ).data;
export const confirmBatch = async (id: string, revision: number) =>
  emailBatchResponseSchema.parse(
    await fetchJson(`/api/v1/email-batches/${id}/confirm`, {
      method: 'POST',
      headers: match(revision),
      body: '{}',
    }),
  ).data;
export const retryDispatch = async (id: string, revision: number) =>
  emailDispatchResponseSchema.parse(
    await fetchJson(`/api/v1/email-dispatches/${id}/retry`, {
      method: 'POST',
      headers: match(revision),
      body: '{}',
    }),
  ).data;
export const reconcileDispatch = async (
  id: string,
  revision: number,
  providerId: string,
) =>
  emailDispatchResponseSchema.parse(
    await fetchJson(`/api/v1/email-dispatches/${id}/reconcile`, {
      method: 'POST',
      headers: match(revision),
      body: JSON.stringify({ providerId }),
    }),
  ).data;
