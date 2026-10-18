import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  apiErrorSchema,
  healthResponseSchema,
} from '@wedding-suite/shared/http';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';

const logger = createLogger('silent');
let clientDirectory: string;
const html = '<!doctype html><html><body>React test shell</body></html>';

beforeAll(async () => {
  clientDirectory = await mkdtemp(path.join(tmpdir(), 'wedding-suite-test-'));
  await mkdir(path.join(clientDirectory, 'assets'));
  await writeFile(path.join(clientDirectory, 'index.html'), html);
  await writeFile(
    path.join(clientDirectory, 'assets', 'app.js'),
    'console.log("asset");',
  );
});

afterAll(async () => {
  await rm(clientDirectory, { recursive: true, force: true });
});

function app(checkReady: () => Promise<void> = async () => {}) {
  return createApp({ checkReady, logger, clientDirectory });
}

describe('health and errors', () => {
  it('exposes liveness/readiness without credentials and supplies request correlation', async () => {
    for (const endpoint of ['live', 'ready']) {
      const response = await request(app())
        .get(`/api/v1/health/${endpoint}`)
        .expect(200);
      const body = healthResponseSchema.parse(response.body);
      expect(body.meta.requestId).toBe(response.headers['x-request-id']);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('reports readiness failure without leaking provider diagnostics', async () => {
    const response = await request(
      app(async () => {
        throw new Error('mongodb://private:password@host');
      }),
    )
      .get('/api/v1/health/ready')
      .expect(503);
    expect(apiErrorSchema.parse(response.body).error.code).toBe(
      'SERVICE_UNAVAILABLE',
    );
    expect(response.text).not.toContain('password');
  });

  it('returns JSON for malformed or oversized API request bodies', async () => {
    const malformed = await request(app())
      .post('/api/unknown')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(apiErrorSchema.parse(malformed.body).error.code).toBe('BAD_REQUEST');
    const oversized = await request(app())
      .post('/api/unknown')
      .send({ text: 'x'.repeat(70000) })
      .expect(413);
    expect(apiErrorSchema.parse(oversized.body).error.code).toBe(
      'PAYLOAD_TOO_LARGE',
    );
  });
});

describe('production routing boundary', () => {
  it.each([
    '/api',
    '/api/',
    '/api/unknown',
    '/api/v1/unknown',
    '/api/v1/health/ready/unknown',
  ])('never sends React HTML for %s', async (url) => {
    for (const method of ['get', 'post', 'put', 'delete', 'options'] as const) {
      const agent = request(app());
      const response = await agent[method](url)
        .set('Accept', 'text/html')
        .expect(404);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    }
  });

  it('serves frontend deep links and real assets', async () => {
    const page = await request(app())
      .get('/dashboard/events')
      .set('Accept', 'text/html')
      .expect(200);
    expect(page.text).toBe(html);
    expect(page.headers['cache-control']).toBe('no-store');
    await request(app())
      .get('/assets/app.js')
      .expect('Content-Type', /javascript/)
      .expect(200);
  });

  it.each([
    '/assets/missing.js',
    '/assets/missing',
    '/favicon.ico',
    '/missing.css',
  ])('does not send React HTML for a missing asset %s', async (url) => {
    const response = await request(app())
      .get(url)
      .set('Accept', 'text/html')
      .expect(404);
    expect(response.text).not.toContain('React test shell');
  });

  it('does not use React fallback for writes or JSON-only reads', async () => {
    await request(app())
      .post('/dashboard')
      .set('Accept', 'text/html')
      .expect(404);
    await request(app())
      .get('/dashboard')
      .set('Accept', 'application/json')
      .expect(404);
  });

  it('does not expose repository documents or local configuration', async () => {
    for (const url of [
      '/PRD.md',
      '/PROJECT_STATUS.md',
      '/server/.env',
      '/.git/config',
    ]) {
      const response = await request(app()).get(url).expect(404);
      expect(response.text).not.toContain('DB_PASSWORD');
    }
  });
});
