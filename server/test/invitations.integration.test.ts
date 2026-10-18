import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { migrateWebsite } from '../src/migrations/003-wedding-events.js';
import { migrateInvitations } from '../src/migrations/004-family-invitations.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import { MongoWebsiteStore } from '../src/modules/website/website.repository.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { MongoInvitationStore } from '../src/modules/invitations/invitations.repository.js';
import { InvitationService } from '../src/modules/invitations/invitations.service.js';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>,
  auth: AuthService,
  website: WebsiteService,
  store: MongoInvitationStore,
  service: InvitationService;
const ceremony = {
  name: 'Test ceremony',
  description: '',
  startAt: '2026-12-31T10:00:00.000Z',
  endAt: null,
  venue: { name: 'Test venue', address: 'Synthetic venue', mapUrl: '' },
  contacts: [{ name: 'Organiser', phone: '+919000000000' }],
  dressCode: '',
  instructions: '',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
};
beforeAll(async () => {
  db = await createTestDatabase();
  await migrateAuth(db.db);
  await migrateWebsite(db.db);
  await migrateInvitations(db.db);
  auth = await createAuthService(new MongoAuthStore(db.client, db.db));
  website = new WebsiteService(new MongoWebsiteStore(db.client, db.db));
  store = new MongoInvitationStore(db.client, db.db);
  service = new InvitationService(
    store,
    new InvitationVault(Buffer.alloc(32, 7)),
    website,
    'https://wedding.example.test',
  );
});
afterAll(async () => {
  if (db) await db.cleanup();
});
async function setup() {
  const created = await auth.register({
    email: `family-${new ObjectId()}@example.test`,
    password: 'a synthetic integration passphrase',
    displayName: 'Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  const actor = (await auth.resolve(created.token))!,
    event = await website.event(actor, ceremony);
  return {
    actor,
    event,
    input: {
      familyDisplayName: 'Synthetic family',
      contactName: 'Private contact',
      phone: '+919000000001',
      eventIds: [event.id],
    },
  };
}
async function publish(actor: Awaited<ReturnType<typeof setup>>['actor']) {
  const w = (await website.read(actor)).wedding;
  await website.publish(actor, w.revision, true);
}
const tokenFrom = (url: string) => url.split('/').at(-1)!;
describe('Atlas family invitations', () => {
  it('applies migration 004 idempotently and enforces validators, indexes and sent timestamp consistency', async () => {
    await migrateInvitations(db.db);
    expect(await store.ready()).toBe(true);
    expect(
      (await db.db.collection('invitations').indexes()).map((i) => i.name),
    ).toContain('invitation_token');
    await expect(
      db.db.collection('invitations').insertOne({ weddingId: new ObjectId() }),
    ).rejects.toMatchObject({ code: 121 });
    const { actor, input } = await setup(),
      family = await service.create(actor, input);
    await expect(
      db.db
        .collection('invitations')
        .updateOne(
          { _id: new ObjectId(family.id) },
          { $set: { sentStatus: 'sent', sentAt: null } },
        ),
    ).rejects.toMatchObject({ code: 121 });
    const saved = (await store.read(
      actor.wedding._id,
      new ObjectId(family.id),
    ))!.invitation!;
    await expect(
      db.db
        .collection('invitations')
        .insertOne({ ...saved, _id: new ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });
  it('persists recoverable links, rotates/archives them and maintains unique counts across active selected events', async () => {
    const { actor, input, event } = await setup();
    const second = await website.event(actor, {
      ...ceremony,
      name: 'Another ceremony',
    });
    const family = await service.create(actor, {
      ...input,
      eventIds: [event.id, second.id],
    });
    await publish(actor);
    const link = await service.share(actor, family.id);
    expect((await service.share(actor, family.id)).url).toBe(link.url);
    const view = await service.publicView(
      actor.wedding.slug,
      tokenFrom(link.url),
    );
    expect(view.selectedEventIds).toHaveLength(2);
    expect(JSON.stringify(view)).not.toMatch(
      /Private contact|9000000001|tokenHash|revision/,
    );
    await service.change(actor, family.id, 1, 'sent', 'sent');
    let estimate = await service.estimates(actor);
    expect(estimate.sentFamilies).toBe(1);
    expect(estimate.events.map((e) => e.sentFamilies)).toEqual([1, 1]);
    await service.change(actor, family.id, 2, 'rotate', undefined);
    await expect(
      service.publicView(actor.wedding.slug, tokenFrom(link.url)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const fresh = await service.share(actor, family.id);
    expect(fresh.url).not.toBe(link.url);
    await website.archive(actor, event.id, 1, true);
    expect((await service.get(actor, family.id)).archivedEventIds).toEqual([
      event.id,
    ]);
    expect(
      (await service.publicView(actor.wedding.slug, tokenFrom(fresh.url)))
        .selectedEventIds,
    ).toEqual([second.id]);
    estimate = await service.estimates(actor);
    expect(estimate.sentFamilies).toBe(1);
    expect(estimate.events).toHaveLength(1);
    await service.change(actor, family.id, 3, 'archive', undefined);
    expect((await service.estimates(actor)).sentFamilies).toBe(0);
    await expect(
      service.publicView(actor.wedding.slug, tokenFrom(fresh.url)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects competing revisions, rolls back late audit failure and serializes invitation selection with ceremony archive', async () => {
    const { actor, input, event } = await setup(),
      family = await service.create(actor, input);
    const competing = await Promise.allSettled([
      service.change(actor, family.id, 1, 'edit', { contactName: 'One' }),
      service.change(actor, family.id, 1, 'edit', { contactName: 'Two' }),
    ]);
    expect(competing.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(
      service.change(
        actor,
        family.id,
        2,
        'sent',
        'sent',
        null as unknown as string,
      ),
    ).rejects.toMatchObject({ code: 121 });
    expect((await service.get(actor, family.id)).sentStatus).toBe('not_sent');
    await expect(
      service.create(actor, input, null as unknown as string),
    ).rejects.toMatchObject({ code: 121 });
    expect((await service.estimates(actor)).totalFamilies).toBe(1);
    const race = await setup();
    const concurrentManager = {
      ...race.actor.user,
      _id: new ObjectId(),
      emailNormalized: `race-manager-${new ObjectId()}@example.test`,
      role: 'manager' as const,
    };
    await db.db.collection('users').insertOne(concurrentManager);
    const results = await Promise.allSettled([
      service.create(
        { user: concurrentManager, wedding: race.actor.wedding },
        race.input,
      ),
      website.archive(race.actor, race.event.id, 1, false),
    ]);
    // Either create wins and archive sees its reference, or archive wins and selection validation rejects creation.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await service.list(race.actor, {}),
      active = (await website.read(race.actor)).events.filter(
        (e) => !e.archivedAt,
      );
    expect(
      after.items.length === 0 ||
        active.some((e) => e._id.toHexString() === race.event.id),
    ).toBe(true);
    await expect(
      website.archive(actor, event.id, 1, false),
    ).rejects.toMatchObject({ code: 'RESOURCE_REFERENCED' });
  });
  it('denies wrong-wedding IDs, tokens and selections and rechecks current Manager authority', async () => {
    const a = await setup(),
      b = await setup(),
      family = await service.create(a.actor, a.input);
    await publish(a.actor);
    await publish(b.actor);
    await expect(service.get(b.actor, family.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      service.change(b.actor, family.id, 1, 'archive', undefined),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      service.create(b.actor, { ...b.input, eventIds: [a.event.id] }),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_SELECTION' });
    const token = tokenFrom((await service.share(a.actor, family.id)).url);
    await expect(
      service.publicView(b.actor.wedding.slug, token),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const manager = {
      ...a.actor.user,
      _id: new ObjectId(),
      emailNormalized: `manager-${new ObjectId()}@example.test`,
      role: 'manager' as const,
    };
    await db.db.collection('users').insertOne(manager);
    const actor = { user: manager, wedding: a.actor.wedding };
    await service.change(actor, family.id, 1, 'sent', 'sent');
    await db.db
      .collection('users')
      .updateOne({ _id: manager._id }, { $set: { status: 'disabled' } });
    await expect(
      service.change(actor, family.id, 2, 'archive', undefined),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });
  it('paginates with scoped cursors and literal search and never leaks link material in normal reads', async () => {
    const { actor, input } = await setup();
    await service.create(actor, {
      ...input,
      familyDisplayName: 'Literal [family]',
    });
    await service.create(actor, input);
    await service.create(actor, input);
    const one = await service.list(actor, { limit: '2' });
    expect(one.hasMore).toBe(true);
    const two = await service.list(actor, {
      limit: '2',
      cursor: one.nextCursor,
    });
    expect(two.items).toHaveLength(1);
    expect(new Set([...one.items, ...two.items].map((i) => i.id)).size).toBe(3);
    expect(
      (await service.list(actor, { search: '[family]' })).items,
    ).toHaveLength(1);
    expect(JSON.stringify(one)).not.toMatch(/token|Ciphertext|KeyVersion/);
    await expect(
      service.list(actor, {
        limit: '2',
        search: 'changed',
        cursor: one.nextCursor,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
