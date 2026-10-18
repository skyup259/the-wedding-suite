import {
  weddingResponseSchema,
  eventsResponseSchema,
  eventResponseSchema,
  previewResponseSchema,
  guestResponseSchema,
} from '@wedding-suite/shared/website';
import type { WeddingEdit, EventInput } from '@wedding-suite/shared/website';
import { fetchJson } from '../../api/client.js';
const match = (revision: number) => ({ 'If-Match': `"${revision}"` });
export const wedding = async (signal: AbortSignal) =>
  weddingResponseSchema.parse(await fetchJson('/api/v1/wedding', { signal }))
    .data;
export const events = async (signal: AbortSignal) =>
  eventsResponseSchema.parse(await fetchJson('/api/v1/events', { signal }))
    .data;
export const saveWedding = async (input: WeddingEdit, revision: number) =>
  weddingResponseSchema.parse(
    await fetchJson('/api/v1/wedding', {
      method: 'PATCH',
      headers: match(revision),
      body: JSON.stringify(input),
    }),
  ).data;
export const preview = async (signal: AbortSignal) =>
  previewResponseSchema.parse(
    await fetchJson('/api/v1/wedding/preview', { signal }),
  );
export const publication = async (published: boolean, revision: number) =>
  weddingResponseSchema.parse(
    await fetchJson(`/api/v1/wedding/${published ? 'publish' : 'unpublish'}`, {
      method: 'POST',
      headers: match(revision),
    }),
  ).data;
export const announcement = async (
  message: string | null,
  revision: number,
) => {
  const response = await fetchJson('/api/v1/wedding/announcement', {
    method: message === null ? 'DELETE' : 'PUT',
    headers: match(revision),
    ...(message === null ? {} : { body: JSON.stringify({ message }) }),
  });
  return message === null ? null : weddingResponseSchema.parse(response).data;
};
export const saveEvent = async (
  input: EventInput,
  id?: string,
  revision?: number,
) =>
  eventResponseSchema.parse(
    await fetchJson(id ? `/api/v1/events/${id}` : '/api/v1/events', {
      method: id ? 'PATCH' : 'POST',
      ...(revision ? { headers: match(revision) } : {}),
      body: JSON.stringify(input),
    }),
  ).data;
export const archiveEvent = (
  id: string,
  revision: number,
  confirmed: boolean,
) =>
  fetchJson(
    `/api/v1/events/${id}${confirmed ? '?confirmReferenced=true' : ''}`,
    { method: 'DELETE', headers: match(revision) },
  );
export const guest = async (slug: string, signal: AbortSignal) =>
  guestResponseSchema.parse(
    await fetchJson(`/api/v1/public/weddings/${encodeURIComponent(slug)}`, {
      signal,
    }),
  ).data;
