import { healthResponseSchema } from '@wedding-suite/shared/http';
import { fetchJson } from './client.js';

export async function getReadiness(signal: AbortSignal) {
  return healthResponseSchema.parse(
    await fetchJson('/api/v1/health/ready', { signal }),
  );
}
