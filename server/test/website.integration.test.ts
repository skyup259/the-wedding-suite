import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { migrateWebsite } from '../src/migrations/003-wedding-events.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { MongoWebsiteStore } from '../src/modules/website/website.repository.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
let database: Awaited<ReturnType<typeof createTestDatabase>>,
  auth: AuthService,
  store: MongoWebsiteStore,
  service: WebsiteService;
const ceremony = {
  name: 'Test ceremony',
  description: 'Synthetic event',
  startAt: '2026-12-31T10:00:00.000Z',
  endAt: null,
  venue: { name: 'Test venue', address: 'Synthetic address', mapUrl: '' },
  contacts: [{ name: 'Test contact', phone: '+919000000000' }],
  dressCode: '',
  instructions: '',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
};
beforeAll(async () => {
  database = await createTestDatabase();
  await migrateAuth(database.db);
  await migrateWebsite(database.db);
  store = new MongoWebsiteStore(database.client, database.db);
  auth = await createAuthService(
    new MongoAuthStore(database.client, database.db),
  );
  service = new WebsiteService(store);
});
afterAll(async () => {
  if (database) await database.cleanup();
});
async function owner() {
  const result = await auth.register({
    email: `website-${new ObjectId()}@example.test`,
    password: 'a synthetic integration passphrase',
    displayName: 'Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  return (await auth.resolve(result.token))!;
}
describe('Atlas website and event transactions', () => {
  it('applies migration 003 idempotently, enforces validators and creates the wedding schedule index', async () => {
    await migrateWebsite(database.db);
    expect(await store.ready()).toBe(true);
    expect(
      (await database.db.collection('events').indexes()).some(
        (i) => i.name === 'wedding_schedule',
      ),
    ).toBe(true);
    await expect(
      database.db
        .collection('events')
        .insertOne({ weddingId: new ObjectId(), name: 'Invalid' }),
    ).rejects.toMatchObject({ code: 121 });
  });
  it('keeps draft snapshots private, publishes safe content and closes all new public reads after unpublishing', async () => {
    const actor = await owner();
    await expect(service.public(actor.wedding.slug)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await service.event(actor, ceremony);
    const draft = (await store.read(actor.wedding._id))!;
    const published = await service.publish(
      actor,
      draft.wedding.revision,
      true,
    );
    const guest = await service.public(actor.wedding.slug);
    expect(guest.events).toHaveLength(1);
    expect(JSON.stringify(guest)).not.toMatch(
      /passwordHash|createdBy|updatedBy|retentionVersion|privateLink/,
    );
    await service.publish(actor, published.revision, false);
    await expect(service.public(actor.wedding.slug)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
  it('serializes competing wedding edits and rolls back event/wedding writes after a late audit error', async () => {
    const actor = await owner();
    const results = await Promise.allSettled([
      service.patch(actor, { mainDate: '2027-01-01' }, 1),
      service.patch(actor, { mainDate: '2027-01-02' }, 1),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const before = (await store.read(actor.wedding._id))!;
    await expect(
      service.event(
        actor,
        ceremony,
        undefined,
        undefined,
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      await database.db
        .collection('events')
        .countDocuments({ weddingId: actor.wedding._id }),
    ).toBe(0);
    expect((await store.read(actor.wedding._id))!.wedding.revision).toBe(
      before.wedding.revision,
    );
  });
  it('blocks wrong-wedding event edits, enforces archive references and retains historical records', async () => {
    const a = await owner(),
      b = await owner(),
      event = await service.event(a, ceremony);
    await expect(
      service.event(b, { name: 'Wrong wedding' }, event.id, 1),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await database.db.collection('invitations').insertOne({
      weddingId: a.wedding._id,
      eventIds: [new ObjectId(event.id)],
    });
    await expect(service.archive(a, event.id, 1, false)).rejects.toMatchObject({
      code: 'RESOURCE_REFERENCED',
    });
    const archived = await service.archive(a, event.id, 1, true);
    expect(archived.archivedAt).not.toBeNull();
    expect((await store.read(a.wedding._id))!.events).toHaveLength(1);
  });
  it('checks authority again in transactions and allows Manager content updates', async () => {
    const actor = await owner();
    await database.db
      .collection('users')
      .updateOne({ _id: actor.user._id }, { $set: { status: 'disabled' } });
    await expect(service.event(actor, ceremony)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    const admin = await owner();
    const manager = {
      ...admin.user,
      _id: new ObjectId(),
      role: 'manager' as const,
      emailNormalized: `manager-${new ObjectId()}@example.test`,
    };
    await database.db.collection('users').insertOne(manager);
    const managerActor = { user: manager, wedding: admin.wedding };
    await service.event(managerActor, ceremony);
    const w = (await store.read(admin.wedding._id))!.wedding;
    expect(
      (await service.publish(managerActor, w.revision, true)).publicationStatus,
    ).toBe('published');
  });
});
