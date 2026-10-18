import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService, digest } from '../src/modules/auth/auth.service.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';

let database: Awaited<ReturnType<typeof createTestDatabase>>,
  store: MongoAuthStore,
  app: ReturnType<typeof createApp>;
const origin = 'http://localhost:5173';
const input = (email: string) => ({
  email,
  password: 'a synthetic integration passphrase',
  displayName: 'Test organiser',
  wedding: {
    couple: { partner1Name: 'Test Avani', partner2Name: 'Test Swar' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    themeId: 'traditional' as const,
  },
});
beforeAll(async () => {
  database = await createTestDatabase();
  await migrateAuth(database.db);
  store = new MongoAuthStore(database.client, database.db);
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    auth: {
      service: await createAuthService(store),
      options: {
        origin,
        secure: false,
        csrfSecret: 'synthetic-integration-secret-at-least-32-characters',
      },
    },
  });
});
afterAll(async () => {
  if (database) await database.cleanup();
});
async function post(
  agent: ReturnType<typeof request.agent>,
  route: string,
  body: object,
) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  return agent
    .post('/api/v1/auth/' + route)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send(body);
}

describe('Atlas authentication persistence', () => {
  it('applies migrations idempotently, creates unique indexes and rejects invalid stored records', async () => {
    await migrateAuth(database.db);
    expect(await store.ready()).toBe(true);
    const indexes = await database.db.collection('users').indexes();
    expect(indexes.find((i) => i.name === 'unique_email')?.unique).toBe(true);
    await expect(
      database.db
        .collection('users')
        .insertOne({ emailNormalized: 'invalid@example.test' }),
    ).rejects.toMatchObject({ code: 121 });
  });
  it('persists the complete cookie lifecycle, hashed credentials and same-wedding identity', async () => {
    const agent = request.agent(app),
      other = request.agent(app);
    const first = await post(agent, 'register', input('first@example.test'));
    expect(first.status).toBe(201);
    const second = await post(other, 'register', input('second@example.test'));
    expect(second.status).toBe(201);
    expect(first.body.data.wedding.id).not.toBe(second.body.data.wedding.id);
    const rawCookie = (first.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('ws_session='))!
      .split(';')[0]!;
    const rawToken = rawCookie.split('=')[1]!;
    expect(
      await database.db
        .collection('sessions')
        .findOne({ tokenHash: digest(rawToken) }),
    ).not.toBeNull();
    expect(
      await database.db.collection('sessions').findOne({ tokenHash: rawToken }),
    ).toBeNull();
    const me = await agent
      .get('/api/v1/auth/me?weddingId=' + second.body.data.wedding.id)
      .expect(200);
    expect(me.body.data.wedding.id).toBe(first.body.data.wedding.id);
    expect(
      (await post(agent, 'register', input('third@example.test'))).status,
    ).toBe(409);
    expect((await post(agent, 'logout', {})).status).toBe(204);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', rawCookie)
      .expect(401);
    expect(
      (
        await post(agent, 'login', {
          email: 'first@example.test',
          password: input('').password,
        })
      ).status,
    ).toBe(200);
    const user = await store.findUser('first@example.test');
    await database.db
      .collection('users')
      .updateOne({ _id: user!._id }, { $inc: { sessionVersion: 1 } });
    await agent.get('/api/v1/auth/me').expect(401);
    expect(
      await database.db
        .collection('auditLogs')
        .countDocuments({ action: 'account_registered' }),
    ).toBe(2);
  });
  it('rolls back a wedding insert when a duplicate account or late audit validation fails', async () => {
    const service = await createAuthService(store);
    const initialCount = await database.db
      .collection('weddings')
      .countDocuments();
    await expect(
      service.register(input('first@example.test')),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
    expect(await database.db.collection('weddings').countDocuments()).toBe(
      initialCount,
    );
    // Invalid request correlation type fails the final insert, after wedding,
    // user and session writes; the transaction must roll all of them back.
    await expect(
      service.register(
        input('rollback@example.test'),
        undefined,
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect(await store.findUser('rollback@example.test')).toBeNull();
    expect(await database.db.collection('weddings').countDocuments()).toBe(
      initialCount,
    );
  });
  it('handles concurrent duplicate registration and distributed rate counters atomically', async () => {
    const service = await createAuthService(store);
    const before = await database.db.collection('weddings').countDocuments();
    const results = await Promise.allSettled([
      service.register(input('race@example.test')),
      service.register(input('race@example.test')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await database.db.collection('weddings').countDocuments()).toBe(
      before + 1,
    );
    const key = new ObjectId().toHexString();
    const counts = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.consume(key, new Date(Date.now() + 60000)),
      ),
    );
    expect(new Set(counts).size).toBe(20);
    expect(Math.max(...counts)).toBe(20);
  });
});
