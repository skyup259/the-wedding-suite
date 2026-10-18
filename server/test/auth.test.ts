import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Agent } from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
import {
  createAuthService,
  digest,
  photoExpiry,
} from '../src/modules/auth/auth.service.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';

export const registration = {
  email: 'couple@example.test',
  password: 'a long synthetic passphrase',
  displayName: 'Avani',
  wedding: {
    couple: { partner1Name: 'Avani', partner2Name: 'Swar' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    themeId: 'traditional',
  },
};
const origin = 'http://localhost:5173';
let store: MemoryAuthStore, app: ReturnType<typeof createApp>, agent: Agent;
let now: Date;
async function post(path: string, body: object) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  return agent
    .post(`/api/v1/auth/${path}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken)
    .send(body);
}
beforeEach(async () => {
  store = new MemoryAuthStore();
  now = new Date('2026-10-18T06:00:00Z');
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    auth: {
      service: await createAuthService(store, 86400, () => now),
      options: {
        origin,
        secure: false,
        csrfSecret: 'test-only-csrf-secret-at-least-32-characters',
      },
    },
  });
  agent = request.agent(app);
});

describe('authentication HTTP lifecycle', () => {
  it('creates a draft wedding/Admin, retains a hashed session, restores identity and revokes logout', async () => {
    const created = await post('register', registration);
    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe('admin');
    expect(created.body.data.wedding.publicationStatus).toBe('draft');
    expect(created.body.data.wedding.slug).toBe('avani-swar-31-12-2026');
    expect(created.text).not.toMatch(/passwordHash|tokenHash|a long synthetic/);
    const cookies = created.headers['set-cookie'] as unknown as string[];
    const rawCookie = cookies
      .find((c) => c.startsWith('ws_session='))!
      .split(';')[0]!;
    const rawToken = rawCookie.split('=')[1]!;
    expect(cookies.find((c) => c.startsWith('ws_session='))).toMatch(
      /HttpOnly/,
    );
    expect(store.sessions.has(digest(rawToken))).toBe(true);
    const user = [...store.users.values()][0]!;
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect([...store.weddings.values()][0]!.photoExpiryAt.toISOString()).toBe(
      '2027-01-07T18:30:00.000Z',
    );
    await agent.get('/api/v1/auth/me').expect(200);
    const logout = await post('logout', {});
    expect(logout.status).toBe(204);
    expect(logout.text).toBe('');
    await agent.get('/api/v1/auth/me').expect(401);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', rawCookie)
      .expect(401);
  });
  it('normalises email, blocks second weddings and keeps duplicate registration atomic', async () => {
    expect(
      (
        await post('register', {
          ...registration,
          email: ' Couple@Example.Test ',
        })
      ).status,
    ).toBe(201);
    expect(
      (await post('register', { ...registration, email: 'other@example.test' }))
        .body.error.code,
    ).toBe('ACCOUNT_ALREADY_ASSIGNED');
    await post('logout', {});
    const duplicate = await post('register', registration);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(store.weddings.size).toBe(1);
    expect(store.users.size).toBe(1);
  });
  it('logs in and rotates the prior session so a copied old cookie cannot be reused', async () => {
    const created = await post('register', registration);
    const old = (created.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('ws_session='))!
      .split(';')[0]!;
    expect(
      (
        await post('login', {
          email: registration.email,
          password: registration.password,
        })
      ).status,
    ).toBe(200);
    await request(app).get('/api/v1/auth/me').set('Cookie', old).expect(401);
    await agent.get('/api/v1/auth/me').expect(200);
  });
  it('rejects expired, disabled and version-revoked sessions independently of TTL', async () => {
    await post('register', registration);
    const user = [...store.users.values()][0]!;
    user.sessionVersion++;
    await agent.get('/api/v1/auth/me').expect(401);
    await post('login', {
      email: registration.email,
      password: registration.password,
    });
    now = new Date(now.getTime() + 86400000);
    await agent.get('/api/v1/auth/me').expect(401);
    now = new Date('2026-10-18T06:00:00Z');
    await post('login', {
      email: registration.email,
      password: registration.password,
    });
    user.status = 'disabled';
    await agent.get('/api/v1/auth/me').expect(401);
  });
  it('does not leak whether an email exists or the account is disabled', async () => {
    await post('register', registration);
    await post('logout', {});
    const wrong = await post('login', {
      email: registration.email,
      password: 'wrong',
    });
    const missing = await post('login', {
      email: 'unknown@example.test',
      password: 'wrong',
    });
    [...store.users.values()][0]!.status = 'disabled';
    const disabled = await post('login', {
      email: registration.email,
      password: registration.password,
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(disabled.status).toBe(401);
    expect(wrong.body.error).toEqual(missing.body.error);
    expect(missing.body.error).toEqual(disabled.body.error);
  });
  it('enforces pre-login CSRF, origin and context binding', async () => {
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(registration)
      .expect(403);
    const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', 'https://other.example')
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send(registration)
      .expect(403);
    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send(registration)
      .expect(403);
    await agent
      .get('/api/v1/auth/csrf')
      .set('Origin', 'https://other.example')
      .expect(403);
    expect(store.users.size).toBe(0);
  });
  it('allows the local loopback alias while retaining CSRF protection', async () => {
    const csrf = await agent
      .get('/api/v1/auth/csrf')
      .set('Origin', 'http://127.0.0.1:5173')
      .expect(200);
    await agent
      .post('/api/v1/auth/register')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send(registration)
      .expect(201);
    await agent
      .get('/api/v1/auth/csrf')
      .set('Origin', 'http://127.0.0.1:5174')
      .expect(403);
  });
  it('uses secure Host-prefixed cookies in production configuration', async () => {
    const service = await createAuthService(store);
    const secureApp = createApp({
      logger: createLogger('silent'),
      checkReady: async () => {},
      auth: {
        service,
        options: {
          origin: 'https://wedding.example',
          secure: true,
          csrfSecret: 'test-secret-with-at-least-32-characters',
        },
      },
    });
    const response = await request(secureApp).get('/api/v1/auth/csrf');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.length).toBe(2);
    for (const cookie of cookies) {
      expect(cookie).toMatch(/^__Host-/);
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    }
  });
  it('rejects client-assigned ownership, malformed dates and short passwords with field errors', async () => {
    const response = await post('register', {
      ...registration,
      password: 'short',
      role: 'admin',
      wedding: { ...registration.wedding, mainDate: '2026-02-30' },
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.length).toBeGreaterThan(0);
    expect(store.users.size).toBe(0);
  });
  it('throttles repeated attempts and fails closed when migrations are missing', async () => {
    for (let i = 0; i < 10; i++)
      expect(
        (await post('login', { email: registration.email, password: 'wrong' }))
          .status,
      ).toBe(401);
    const limited = await post('login', {
      email: registration.email,
      password: 'wrong',
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    store.migrated = false;
    await agent.get('/api/v1/auth/csrf').expect(503);
  });
  it('resolves only the session wedding and handles same-name slug collisions', async () => {
    const first = await post('register', registration);
    await post('logout', {});
    const second = await post('register', {
      ...registration,
      email: 'second@example.test',
    });
    expect(second.status).toBe(201);
    expect(second.body.data.wedding.id).not.toBe(first.body.data.wedding.id);
    expect(second.body.data.wedding.slug).toMatch(
      /^avani-swar-31-12-2026-[a-f0-9]{6}$/,
    );
    const me = await agent
      .get('/api/v1/auth/me?weddingId=' + first.body.data.wedding.id)
      .expect(200);
    expect(me.body.data.wedding.id).toBe(second.body.data.wedding.id);
  });
  it('computes midnight retention using the wedding timezone across daylight saving', () => {
    expect(photoExpiry('2026-10-31', 'America/New_York').toISOString()).toBe(
      '2026-11-08T05:00:00.000Z',
    );
  });
});
