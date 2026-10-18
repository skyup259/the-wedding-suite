import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
import { createAuthService, digest } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { AccessService } from '../src/modules/access/access.service.js';
import { EmailVault, EmailFailure } from '../src/infrastructure/email.js';
import { AuthEmailWorker } from '../src/jobs/auth-email.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryAccessStore } from './helpers/memory-access-store.js';
const origin = 'http://localhost:5173',
  password = 'a synthetic manager passphrase';
const registration = {
  email: 'admin@example.test',
  password,
  displayName: 'Test Admin',
  wedding: {
    couple: { partner1Name: 'Avani', partner2Name: 'Swar' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    themeId: 'traditional' as const,
  },
};
let authStore: MemoryAuthStore,
  store: MemoryAccessStore,
  auth: AuthService,
  access: AccessService,
  app: ReturnType<typeof createApp>,
  admin: ReturnType<typeof request.agent>,
  now: Date;
const vault = new EmailVault(Buffer.alloc(32, 1));
async function write(
  agent: ReturnType<typeof request.agent>,
  path: string,
  body: object = {},
  method: 'post' | 'patch' | 'delete' = 'post',
  revision?: number,
) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  let req = agent[method]('/api/v1/' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken);
  if (revision) req = req.set('If-Match', `"${revision}"`);
  return req.send(body);
}
function rawLink(purpose: 'manager_invite' | 'password_reset') {
  const jobs = [...store.jobs.values()].filter(
    (j) =>
      j.payload &&
      store.tokens.get(j.tokenId.toHexString())?.purpose === purpose,
  );
  const job = jobs.at(-1)!;
  const mail = vault.open(job.payload!, job._id.toHexString());
  return /#token=([a-f0-9]{64})/.exec(mail.text)![1]!;
}
async function invite(email = 'manager@example.test') {
  const response = await write(admin, 'team/invitations', {
    email,
    displayName: 'Test Manager',
  });
  expect(response.status).toBe(201);
  return {
    id: response.body.data.id as string,
    revision: response.body.data.revision as number,
    token: rawLink('manager_invite'),
  };
}
async function accept(token: string) {
  const agent = request.agent(app);
  const result = await write(agent, 'auth/manager-invitations/accept', {
    token,
    displayName: 'Test Manager',
    password,
  });
  return { agent, result };
}
beforeEach(async () => {
  now = new Date('2026-10-18T06:00:00Z');
  authStore = new MemoryAuthStore();
  store = new MemoryAccessStore(authStore);
  auth = await createAuthService(authStore, 86400, () => now);
  access = new AccessService(store, auth, vault, origin);
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    auth: {
      service: auth,
      options: {
        origin,
        secure: false,
        csrfSecret: 'test-csrf-secret-longer-than-32-characters',
      },
    },
    access,
  });
  admin = request.agent(app);
  expect((await write(admin, 'auth/register', registration)).status).toBe(201);
});
describe('Manager access and recovery HTTP flows', () => {
  it('creates a hashed, encrypted invitation, accepts it once and signs in to exactly the inviting wedding', async () => {
    const inviteResult = await invite();
    expect([...store.tokens.values()][0]!.tokenHash).toBe(
      digest(inviteResult.token),
    );
    const job = [...store.jobs.values()][0]!;
    expect(job.payload).not.toContain(inviteResult.token);
    expect(job.payload).not.toContain('manager@example.test');
    const listed = await admin.get('/api/v1/team/invitations').expect(200);
    expect(listed.text).not.toMatch(/tokenHash|payload|#token/);
    expect(listed.body.data[0].delivery).toBe('queued');
    const { agent, result } = await accept(inviteResult.token);
    expect(result.status).toBe(201);
    expect(result.body.data.user.role).toBe('manager');
    const owner = await admin.get('/api/v1/auth/me');
    expect(result.body.data.wedding.id).toBe(owner.body.data.wedding.id);
    await agent.get('/api/v1/auth/me').expect(200);
    expect((await accept(inviteResult.token)).result.status).toBe(400);
    expect(authStore.users.size).toBe(2);
    const team = await agent.get('/api/v1/team').expect(200);
    expect(team.body.data).toHaveLength(2);
    expect(team.text).not.toContain('@example.test');
    await agent.get('/api/v1/team/invitations').expect(403);
    expect(
      (await write(agent, 'team/invitations', { email: 'bad@example.test' }))
        .status,
    ).toBe(403);
  });
  it('rotates on resend, enforces revisions and revokes old or unused links', async () => {
    const i = await invite();
    expect((await write(admin, `team/invitations/${i.id}/resend`)).status).toBe(
      428,
    );
    const resent = await write(
      admin,
      `team/invitations/${i.id}/resend`,
      {},
      'post',
      1,
    );
    expect(resent.status).toBe(202);
    const replacement = rawLink('manager_invite');
    expect(replacement).not.toBe(i.token);
    expect((await accept(i.token)).result.status).toBe(400);
    expect(
      (await write(admin, `team/invitations/${i.id}`, {}, 'delete', 1)).status,
    ).toBe(412);
    expect(
      (await write(admin, `team/invitations/${i.id}`, {}, 'delete', 2)).status,
    ).toBe(204);
    expect((await accept(replacement)).result.status).toBe(400);
  });
  it('checks expiry without TTL deletion and rolls back Manager creation on late failure', async () => {
    const i = await invite();
    store.failAudit = true;
    expect((await accept(i.token)).result.status).toBe(500);
    expect(authStore.users.size).toBe(1);
    expect([...store.tokens.values()][0]!.usedAt).toBeNull();
    store.failAudit = false;
    now = new Date(now.getTime() + 172800000);
    expect((await accept(i.token)).result.status).toBe(410);
  });
  it('prevents cross-wedding access and joining with an existing account', async () => {
    const i = await invite();
    const other = request.agent(app);
    expect(
      (
        await write(other, 'auth/register', {
          ...registration,
          email: 'other@example.test',
        })
      ).status,
    ).toBe(201);
    expect(
      (await write(other, `team/invitations/${i.id}/resend`, {}, 'post', 1))
        .status,
    ).toBe(404);
    expect(
      (
        await write(other, 'auth/manager-invitations/accept', {
          token: i.token,
          displayName: 'Wrong wedding',
          password,
        })
      ).status,
    ).toBe(409);
    const anonymous = request.agent(app);
    expect(
      (
        await write(anonymous, 'auth/register', {
          ...registration,
          email: 'manager@example.test',
        })
      ).status,
    ).toBe(201);
    await write(anonymous, 'auth/logout');
    expect((await accept(i.token)).result.status).toBe(409);
    expect((await admin.get('/api/v1/team')).body.data).toHaveLength(1);
  });
  it('disables Managers, revokes their sessions and reset links, and protects the Admin', async () => {
    const i = await invite();
    const { agent, result } = await accept(i.token);
    const id = result.body.data.user.id as string;
    await write(request.agent(app), 'auth/password-reset/request', {
      email: 'manager@example.test',
    });
    const reset = rawLink('password_reset');
    const disabled = await write(
      admin,
      `team/${id}`,
      { status: 'disabled' },
      'patch',
      1,
    );
    expect(disabled.status).toBe(200);
    await agent.get('/api/v1/auth/me').expect(401);
    expect(
      (
        await write(agent, 'auth/login', {
          email: 'manager@example.test',
          password,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await write(request.agent(app), 'auth/password-reset/confirm', {
          token: reset,
          newPassword: password,
        })
      ).status,
    ).toBe(400);
    const own = (await admin.get('/api/v1/auth/me')).body.data.user
      .id as string;
    expect(
      (await write(admin, `team/${own}`, { status: 'disabled' }, 'patch', 1))
        .status,
    ).toBe(403);
    expect(
      (await write(admin, `team/${id}`, { status: 'active' }, 'patch', 2))
        .status,
    ).toBe(200);
    await agent.get('/api/v1/auth/me').expect(401);
    expect(
      (
        await write(agent, 'auth/login', {
          email: 'manager@example.test',
          password,
        })
      ).status,
    ).toBe(200);
  });
  it('returns identical recovery responses for active, unknown and disabled accounts', async () => {
    const agent = request.agent(app);
    const known = await write(agent, 'auth/password-reset/request', {
      email: registration.email,
    });
    const unknown = await write(agent, 'auth/password-reset/request', {
      email: 'unknown@example.test',
    });
    const user = [...authStore.users.values()][0]!;
    user.status = 'disabled';
    const disabled = await write(agent, 'auth/password-reset/request', {
      email: registration.email,
    });
    expect([known.status, unknown.status, disabled.status]).toEqual([
      202, 202, 202,
    ]);
    expect(known.body.data).toEqual(unknown.body.data);
    expect(unknown.body.data).toEqual(disabled.body.data);
    expect(store.jobs.size).toBe(1);
    expect(known.text).not.toMatch(/token|@example/);
  });
  it('replaces previous reset links, updates the password once and revokes every session', async () => {
    const second = request.agent(app);
    await write(second, 'auth/login', { email: registration.email, password });
    const guest = request.agent(app);
    await write(guest, 'auth/password-reset/request', {
      email: registration.email,
    });
    const old = rawLink('password_reset');
    await write(guest, 'auth/password-reset/request', {
      email: registration.email,
    });
    const token = rawLink('password_reset');
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token: old,
          newPassword: password,
        })
      ).status,
    ).toBe(400);
    const replacement = 'a different synthetic passphrase';
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(204);
    await admin.get('/api/v1/auth/me').expect(401);
    await second.get('/api/v1/auth/me').expect(401);
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token,
          newPassword: replacement,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await write(guest, 'auth/login', {
          email: registration.email,
          password,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await write(guest, 'auth/login', {
          email: registration.email,
          password: replacement,
        })
      ).status,
    ).toBe(200);
  });
  it('rejects expired resets, missing CSRF, client-assigned fields and unmigrated access features', async () => {
    const guest = request.agent(app);
    await guest
      .post('/api/v1/auth/password-reset/request')
      .set('Origin', origin)
      .send({ email: registration.email })
      .expect(403);
    expect(
      (
        await write(admin, 'team/invitations', {
          email: 'new@example.test',
          role: 'admin',
          weddingId: 'bad',
        })
      ).status,
    ).toBe(422);
    await write(guest, 'auth/password-reset/request', {
      email: registration.email,
    });
    const token = rawLink('password_reset');
    now = new Date(now.getTime() + 3600000);
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token,
          newPassword: password,
        })
      ).status,
    ).toBe(410);
    store.migrated = false;
    await admin.get('/api/v1/team').expect(503);
  });
  it('allows only one concurrent token consumption and rolls back password changes on audit failure', async () => {
    const i = await invite();
    const results = await Promise.all([accept(i.token), accept(i.token)]);
    expect(results.map((r) => r.result.status).sort()).toEqual([201, 400]);
    const guest = request.agent(app);
    await write(guest, 'auth/password-reset/request', {
      email: registration.email,
    });
    const token = rawLink('password_reset');
    store.failAudit = true;
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token,
          newPassword: 'another synthetic password',
        })
      ).status,
    ).toBe(500);
    store.failAudit = false;
    await admin.get('/api/v1/auth/me').expect(200);
    expect(
      (
        await write(guest, 'auth/password-reset/confirm', {
          token,
          newPassword: 'another synthetic password',
        })
      ).status,
    ).toBe(204);
  });
  it('paginates team invitations with wedding-bound cursors', async () => {
    await invite('page-one@example.test');
    await invite('page-two@example.test');
    const first = await admin
      .get('/api/v1/team/invitations?limit=1')
      .expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta.hasMore).toBe(true);
    const cursor = String(first.body.meta.nextCursor);
    const second = await admin
      .get(
        '/api/v1/team/invitations?limit=1&cursor=' + encodeURIComponent(cursor),
      )
      .expect(200);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(second.body.meta.hasMore).toBe(false);
    await admin
      .get('/api/v1/team?cursor=' + encodeURIComponent(cursor))
      .expect(422);
    const other = request.agent(app);
    await write(other, 'auth/register', {
      ...registration,
      email: 'cursor-owner@example.test',
    });
    await other
      .get('/api/v1/team/invitations?cursor=' + encodeURIComponent(cursor))
      .expect(422);
    await admin.get('/api/v1/team/invitations?limit=101').expect(422);
  });
  it('rate limits recovery equally for unknown accounts', async () => {
    const guest = request.agent(app);
    for (let i = 0; i < 3; i++)
      expect(
        (
          await write(guest, 'auth/password-reset/request', {
            email: 'unknown@example.test',
          })
        ).status,
      ).toBe(202);
    const limited = await write(guest, 'auth/password-reset/request', {
      email: 'unknown@example.test',
    });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
describe('durable auth email worker', () => {
  it('dispatches once, removes the encrypted envelope and reports provider acceptance separately', async () => {
    await invite();
    const send = vi.fn().mockResolvedValue('accepted');
    const worker = new AuthEmailWorker(store, vault, { send }, () => now);
    await worker.once();
    await worker.once();
    expect(send).toHaveBeenCalledTimes(1);
    expect([...store.jobs.values()][0]).toMatchObject({
      status: 'completed',
      outcome: 'accepted',
      payload: null,
    });
    expect(
      (await admin.get('/api/v1/team/invitations')).body.data[0].delivery,
    ).toBe('accepted');
  });
  it('retries with the same provider key after a transient failure', async () => {
    await invite();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new EmailFailure('PROVIDER_UNAVAILABLE'))
      .mockResolvedValue('accepted');
    const worker = new AuthEmailWorker(store, vault, { send }, () => now);
    await worker.once();
    await worker.once();
    expect(send).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 30000);
    await worker.once();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1]).toBe(send.mock.calls[1]![1]);
  });
  it('recovers expired leases and fences stale completion', async () => {
    await invite();
    const first = await store.claim('worker-one', now);
    now = new Date(now.getTime() + 60001);
    const second = await store.claim('worker-two', now);
    expect(second!.leaseVersion).toBe(first!.leaseVersion + 1);
    await store.finish(first!, now, 'accepted');
    expect([...store.jobs.values()][0]!.status).toBe('running');
    await store.finish(second!, now, 'outbox');
    expect([...store.jobs.values()][0]!.outcome).toBe('outbox');
  });
  it('never sends revoked links and fails permanently on recipient restrictions', async () => {
    const i = await invite();
    await write(admin, `team/invitations/${i.id}`, {}, 'delete', 1);
    const send = vi
      .fn()
      .mockRejectedValue(new EmailFailure('RECIPIENT_NOT_ALLOWED', true));
    const worker = new AuthEmailWorker(store, vault, { send }, () => now);
    await worker.once();
    expect(send).not.toHaveBeenCalled();
    await invite('another@example.test');
    await worker.once();
    expect([...store.jobs.values()].at(-1)).toMatchObject({
      status: 'failed',
      payload: null,
      errorCode: 'RECIPIENT_NOT_ALLOWED',
    });
  });
  it('stops uncertain sends before the provider idempotency window expires', async () => {
    await invite();
    const job = [...store.jobs.values()][0]!;
    job.firstAttemptAt = new Date(now.getTime() - 23 * 3600000);
    const send = vi.fn();
    await new AuthEmailWorker(store, vault, { send }, () => now).once();
    expect(send).not.toHaveBeenCalled();
    expect([...store.jobs.values()][0]).toMatchObject({
      status: 'failed',
      errorCode: 'RECONCILIATION_REQUIRED',
      payload: null,
    });
  });
});
