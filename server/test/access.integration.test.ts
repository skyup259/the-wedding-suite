import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { migrateAccess } from '../src/migrations/002-team-recovery.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService, digest } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { MongoAccessStore } from '../src/modules/access/access.repository.js';
import { AccessService } from '../src/modules/access/access.service.js';
import type { EmailJob } from '../src/modules/access/access.types.js';
import { EmailVault } from '../src/infrastructure/email.js';
let database: Awaited<ReturnType<typeof createTestDatabase>>,
  store: MongoAccessStore,
  auth: AuthService,
  access: AccessService;
const vault = new EmailVault(Buffer.alloc(32, 3)),
  password = 'synthetic integration passphrase';
beforeAll(async () => {
  database = await createTestDatabase();
  await migrateAuth(database.db);
  await migrateAccess(database.db);
  store = new MongoAccessStore(database.client, database.db);
  auth = await createAuthService(
    new MongoAuthStore(database.client, database.db),
  );
  access = new AccessService(store, auth, vault, 'http://localhost:5173');
});
afterAll(async () => {
  if (database) await database.cleanup();
});
async function owner() {
  const email = `owner-${new ObjectId().toHexString()}@example.test`;
  const result = await auth.register({
    email,
    password,
    displayName: 'Test Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  return {
    actor: (await auth.resolve(result.token))!,
    token: result.token,
    email,
  };
}
async function link(weddingId: ObjectId) {
  const job = await database.db
    .collection<EmailJob>('jobs')
    .find({ weddingId })
    .sort({ createdAt: -1, _id: -1 })
    .next();
  const mail = vault.open(job!.payload!, job!._id.toHexString());
  return /#token=([a-f0-9]{64})/.exec(mail.text)![1]!;
}
describe('Atlas team/recovery persistence', () => {
  it('migrates idempotently and enforces token/job validators and uniqueness', async () => {
    await migrateAccess(database.db);
    expect(await store.ready()).toBe(true);
    await expect(
      database.db
        .collection('authTokens')
        .insertOne({ purpose: 'manager_invite' }),
    ).rejects.toMatchObject({ code: 121 });
    const indexes = await database.db.collection('authTokens').indexes();
    expect(
      indexes.find((i) => i.name === 'unique_access_token_hash')?.unique,
    ).toBe(true);
    expect(
      indexes.find((i) => i.name === 'expired_access_tokens')
        ?.expireAfterSeconds,
    ).toBe(0);
  });
  it('consumes an invitation once under concurrent acceptance and keeps the account in its wedding', async () => {
    const { actor } = await owner();
    await access.invite(
      actor,
      { email: `manager-${new ObjectId()}@example.test` },
      'integration',
    );
    const token = await link(actor.wedding._id);
    const results = await Promise.allSettled([
      access.accept(
        { token, displayName: 'Manager', password },
        undefined,
        'integration',
      ),
      access.accept(
        { token, displayName: 'Manager', password },
        undefined,
        'integration',
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const accepted = results.find((r) => r.status === 'fulfilled')!;
    if (accepted.status !== 'fulfilled') throw new Error('Expected acceptance');
    const snapshot = await auth.resolve(accepted.value.token);
    expect(snapshot!.user.weddingId.equals(actor.wedding._id)).toBe(true);
    expect(
      await database.db
        .collection('users')
        .countDocuments({ weddingId: actor.wedding._id }),
    ).toBe(2);
    expect(
      await database.db
        .collection('authTokens')
        .findOne({ tokenHash: digest(token), usedAt: { $ne: null } }),
    ).not.toBeNull();
  });
  it('rolls back token/account/session/email effects after late audit validation failure', async () => {
    const { actor } = await owner();
    await expect(
      access.invite(
        actor,
        { email: `rollback-${new ObjectId()}@example.test` },
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      await database.db
        .collection('authTokens')
        .countDocuments({ weddingId: actor.wedding._id }),
    ).toBe(0);
    expect(
      await database.db
        .collection('jobs')
        .countDocuments({ weddingId: actor.wedding._id }),
    ).toBe(0);
    await access.invite(
      actor,
      { email: `rollback-manager-${new ObjectId()}@example.test` },
      'integration',
    );
    const token = await link(actor.wedding._id);
    await expect(
      access.accept(
        { token, displayName: 'Manager', password },
        undefined,
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      await database.db
        .collection('users')
        .countDocuments({ weddingId: actor.wedding._id }),
    ).toBe(1);
    expect(
      (await database.db
        .collection('authTokens')
        .findOne({ tokenHash: digest(token) }))!.usedAt,
    ).toBeNull();
  });
  it('replaces reset tokens, permits only one concurrent reset and revokes existing sessions', async () => {
    const { actor, token, email } = await owner();
    await access.requestReset(email, 'integration');
    const old = await link(actor.wedding._id);
    await access.requestReset(email, 'integration');
    const current = await link(actor.wedding._id);
    await expect(
      access.confirmReset(old, password, 'integration'),
    ).rejects.toMatchObject({ code: 'INVALID_SETUP_LINK' });
    const results = await Promise.allSettled([
      access.confirmReset(current, 'a new synthetic password', 'integration'),
      access.confirmReset(current, 'a new synthetic password', 'integration'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await auth.resolve(token)).toBeNull();
    const result = await auth.login({
      email,
      password: 'a new synthetic password',
    });
    expect(result.data.user.id).toBe(actor.user._id.toHexString());
  });
  it('claims a job exclusively, recovers abandoned leases and fences stale workers', async () => {
    const { actor } = await owner();
    await access.invite(
      actor,
      { email: `worker-${new ObjectId()}@example.test` },
      'integration',
    );
    // Cancel other fixture work so this assertion targets one durable effect.
    await database.db
      .collection('jobs')
      .updateMany(
        { weddingId: { $ne: actor.wedding._id } },
        { $set: { status: 'completed', payload: null, outcome: 'cancelled' } },
      );
    const now = new Date();
    const claims = await Promise.all([
      store.claim('first', now),
      store.claim('second', now),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    const later = new Date(now.getTime() + 60001);
    const second = await store.claim('recovery', later);
    expect(second!.leaseVersion).toBe(first.leaseVersion + 1);
    await store.finish(first, later, 'accepted');
    expect(
      (await database.db.collection('jobs').findOne({ _id: first._id }))!
        .status,
    ).toBe('running');
    await store.finish(second!, later, 'outbox');
    expect(
      (await database.db.collection('jobs').findOne({ _id: first._id }))!
        .payload,
    ).toBeNull();
  });
  it('rejects cross-wedding mutations and invalidates Manager sessions on disablement', async () => {
    const first = await owner(),
      second = await owner();
    const invitation = await access.invite(
      first.actor,
      { email: `isolation-${new ObjectId()}@example.test` },
      'integration',
    );
    await expect(
      access.changeInvitation(
        second.actor,
        invitation.id,
        1,
        true,
        'integration',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const token = await link(first.actor.wedding._id);
    const manager = await access.accept(
      { token, displayName: 'Manager', password },
      undefined,
      'integration',
    );
    await access.changeMember(
      first.actor,
      manager.data.user.id,
      1,
      'disabled',
      'integration',
    );
    expect(await auth.resolve(manager.token)).toBeNull();
    await expect(
      access.changeMember(
        first.actor,
        first.actor.user._id.toHexString(),
        1,
        'disabled',
        'integration',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
