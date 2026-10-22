import { beforeAll, afterAll, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { migrateAccess } from '../src/migrations/002-team-recovery.js';
import { migrateWebsite } from '../src/migrations/003-wedding-events.js';
import { migrateInvitations } from '../src/migrations/004-family-invitations.js';
import { migrateCampaigns } from '../src/migrations/005-invitation-email.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { digest, createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthService } from '../src/modules/auth/auth.service.js';
import type { AuthSnapshot } from '../src/modules/auth/auth.types.js';
import { MongoWebsiteStore } from '../src/modules/website/website.repository.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { MongoInvitationStore } from '../src/modules/invitations/invitations.repository.js';
import { InvitationService } from '../src/modules/invitations/invitations.service.js';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
import { EmailVault, EmailFailure } from '../src/infrastructure/email.js';
import { MongoCampaignStore } from '../src/modules/campaigns/campaigns.repository.js';
import {
  CampaignService,
  applyReceipt,
} from '../src/modules/campaigns/campaigns.service.js';
import { InvitationEmailWorker } from '../src/jobs/invitation-email.js';
import type { DispatchRecord } from '../src/modules/campaigns/campaigns.types.js';
let db: Awaited<ReturnType<typeof createTestDatabase>>,
  auth: AuthService,
  website: WebsiteService,
  links: InvitationService,
  store: MongoCampaignStore,
  service: CampaignService;
const vault = new EmailVault(Buffer.alloc(32, 5)),
  transport = {
    sendWithReceipt: async () => ({
      outcome: 'accepted' as const,
      providerId: randomUUID(),
    }),
  };
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
  await migrateAccess(db.db);
  await migrateWebsite(db.db);
  await migrateInvitations(db.db);
  await migrateCampaigns(db.db);
  auth = await createAuthService(new MongoAuthStore(db.client, db.db));
  website = new WebsiteService(new MongoWebsiteStore(db.client, db.db));
  links = new InvitationService(
    new MongoInvitationStore(db.client, db.db),
    new InvitationVault(Buffer.alloc(32, 7)),
    website,
    'https://wedding.example.test',
  );
  store = new MongoCampaignStore(db.client, db.db);
  service = new CampaignService(store, links, vault, 'resend', null, transport);
});
afterAll(async () => {
  if (db) await db.cleanup();
});
async function setup() {
  const r = await auth.register({
    email: `campaign-${new ObjectId()}@example.test`,
    password: 'a synthetic integration passphrase',
    displayName: 'Admin',
    wedding: {
      couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
      mainDate: '2026-12-31',
      timezone: 'Asia/Kolkata',
      themeId: 'traditional',
    },
  });
  const actor = (await auth.resolve(r.token))!,
    event = await website.event(actor, ceremony);
  await website.publish(
    actor,
    (await website.read(actor)).wedding.revision,
    true,
  );
  return { actor, event };
}
const createFamily = (actor: AuthSnapshot, eventId: string, n = 0) =>
  links.create(actor, {
    familyDisplayName: `Family ${n}`,
    contactName: 'Private contact',
    phone: '',
    email: `family-${n}@example.test`,
    eventIds: [eventId],
  });
it('applies migration 005 idempotently including recovery after a partial run and keeps both job schemas strict', async () => {
  await migrateCampaigns(db.db);
  expect(await store.ready()).toBe(true);
  await db.db
    .collection('schemaMigrations')
    .deleteOne({ _id: '005-invitation-email' } as never);
  await migrateCampaigns(db.db);
  await expect(
    db.db.collection('jobs').insertOne({ type: 'invitation_email' }),
  ).rejects.toMatchObject({ code: 121 });
  await expect(
    db.db.collection('jobs').insertOne({ type: 'unknown' }),
  ).rejects.toMatchObject({ code: 121 });
  await expect(
    db.db.collection('invitationEmailQuotas').insertOne({
      _id: new ObjectId(),
      timezone: 'Asia/Kolkata',
      day: '2026-10-19',
      first: 26,
    }),
  ).rejects.toMatchObject({ code: 121 });
  const { actor, event } = await setup(),
    i = await createFamily(actor, event.id);
  expect((await links.get(actor, i.id)).email).toBe('family-0@example.test');
});
it('serializes competing Admin/Manager batch reservations, caps the quota and replays confirmation without duplicate jobs', async () => {
  const { actor, event } = await setup(),
    manager = {
      ...actor.user,
      _id: new ObjectId(),
      emailNormalized: `campaign-manager-${new ObjectId()}@example.test`,
      role: 'manager' as const,
    };
  await db.db.collection('users').insertOne(manager);
  const other = { user: manager, wedding: actor.wedding };
  const base = await createFamily(actor, event.id),
    record = (await links.store.read(actor.wedding._id, new ObjectId(base.id)))!
      .invitation!;
  const more = Array.from({ length: 25 }, (_, n) => {
    const id = new ObjectId(),
      token =
        randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    return {
      ...record,
      _id: id,
      tokenHash: digest(token),
      tokenCiphertext: new InvitationVault(Buffer.alloc(32, 7)).seal(
        token,
        `family-invitation:${record.weddingId}:${id}:1`,
      ),
      familyDisplayName: `Family ${n + 1}`,
    };
  });
  await db.db.collection('invitations').insertMany(more);
  const ids = [new ObjectId(base.id), ...more.map((i) => i._id)],
    a = await service.preview(actor, ids.slice(0, 20), 'test'),
    b = await service.preview(other, ids.slice(20), 'test');
  const results = await Promise.allSettled([
    service.confirm(actor, new ObjectId(a.id), 1, 'test'),
    service.confirm(other, new ObjectId(b.id), 1, 'test'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const winner = results[0]!.status === 'fulfilled' ? a : b,
    who = results[0]!.status === 'fulfilled' ? actor : other;
  await service.confirm(who, new ObjectId(winner.id), 1, 'test');
  const count = await db.db
    .collection('jobs')
    .countDocuments({ weddingId: actor.wedding._id, type: 'invitation_email' });
  expect(count).toBe(winner.items.length);
  expect(count).toBeLessThanOrEqual(25);
  const quota = await db.db
    .collection('invitationEmailQuotas')
    .findOne({ _id: actor.wedding._id });
  expect(quota!.first).toBe(count);
}, 30000);
it('rolls back jobs, sequence and allowance after a late audit failure and rejects wrong-wedding batches or changed previews', async () => {
  const a = await setup(),
    b = await setup(),
    i = await createFamily(a.actor, a.event.id),
    preview = await service.preview(a.actor, [new ObjectId(i.id)], 'test');
  await expect(
    service.get(b.actor, new ObjectId(preview.id)),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    service.confirm(
      a.actor,
      new ObjectId(preview.id),
      1,
      null as unknown as string,
    ),
  ).rejects.toMatchObject({ code: 121 });
  expect(
    await db.db
      .collection('jobs')
      .countDocuments({ weddingId: a.actor.wedding._id }),
  ).toBe(0);
  expect(
    await db.db
      .collection('invitationEmailQuotas')
      .countDocuments({ _id: a.actor.wedding._id }),
  ).toBe(0);
  expect((await links.get(a.actor, i.id)).emailQueued).toBe(false);
  await links.change(a.actor, i.id, 1, 'edit', {
    email: 'changed@example.test',
  });
  await expect(
    service.confirm(a.actor, new ObjectId(preview.id), 1, 'test'),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
});
it('processes provider acceptance transactionally and deduplicates early/out-of-order webhook events', async () => {
  const { actor, event } = await setup(),
    i = await createFamily(actor, event.id),
    b = await service.preview(actor, [new ObjectId(i.id)], 'test');
  await service.confirm(actor, new ObjectId(b.id), 1, 'test');
  const providerId = randomUUID(),
    receipt = {
      _id: randomUUID(),
      providerId,
      type: 'email.delivered',
      occurredAt: new Date(),
      receivedAt: new Date(),
    };
  await Promise.all([
    store.webhook(receipt, (j) => applyReceipt(j, receipt)),
    store.webhook(receipt, (j) => applyReceipt(j, receipt)),
  ]);
  const target = (
    await store.dispatches(actor.wedding._id, new ObjectId(b.id))
  )[0]!;
  const worker = new InvitationEmailWorker(service, vault, {
    sendWithReceipt: async (_mail, key) => ({
      outcome: 'accepted',
      providerId: key === target.idempotencyKey ? providerId : randomUUID(),
    }),
  });
  // Other tests may leave queued synthetic jobs. Drain only until this batch reaches its terminal state.
  for (let n = 0; n < 30; n++) {
    const current = await store.dispatches(
      actor.wedding._id,
      new ObjectId(b.id),
    );
    if (current[0]?.status === 'accepted') break;
    await worker.once();
  }
  const job = (
    await store.dispatches(actor.wedding._id, new ObjectId(b.id))
  )[0]!;
  expect(job.status).toBe('accepted');
  expect(job.delivery).toBe('delivered');
  expect(job.payload).toBeNull();
  expect((await links.estimates(actor)).sentFamilies).toBe(1);
  const old = { ...receipt, _id: randomUUID(), type: 'email.sent' };
  await store.webhook(old, (j) => applyReceipt(j, old));
  expect(
    (await store.dispatches(actor.wedding._id, new ObjectId(b.id)))[0]!
      .delivery,
  ).toBe('delivered');
}, 30000);
it('fences stale leases, rechecks disabled authority, and bounds uncertain provider retries', async () => {
  const { actor, event } = await setup(),
    i = await createFamily(actor, event.id),
    b = await service.preview(actor, [new ObjectId(i.id)], 'test');
  await service.confirm(actor, new ObjectId(b.id), 1, 'test');
  await db.db
    .collection('users')
    .updateOne({ _id: actor.user._id }, { $set: { status: 'disabled' } });
  await expect(service.get(actor, new ObjectId(b.id))).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  const job = (
    await store.dispatches(actor.wedding._id, new ObjectId(b.id))
  )[0]!;
  await db.db
    .collection<DispatchRecord>('jobs')
    .updateOne({ _id: job._id }, { $set: { attempts: 7 } });
  const worker = new InvitationEmailWorker(service, vault, {
    sendWithReceipt: async () => {
      throw new EmailFailure('PROVIDER_UNAVAILABLE');
    },
  });
  for (let n = 0; n < 30; n++) {
    const current = (
      await store.dispatches(actor.wedding._id, new ObjectId(b.id))
    )[0]!;
    if (current.status === 'unknown') break;
    await worker.once();
  }
  expect(
    (await store.dispatches(actor.wedding._id, new ObjectId(b.id)))[0]!.status,
  ).toBe('unknown');
});

it('preserves a delivery receipt racing with provider-ID binding', async () => {
  const { actor, event } = await setup(),
    family = await createFamily(actor, event.id),
    preview = await service.preview(actor, [new ObjectId(family.id)], 'test');
  await service.confirm(actor, new ObjectId(preview.id), 1, 'test');
  let observed = () => {},
    proceed = () => {};
  const entered = new Promise<void>((r) => {
      observed = r;
    }),
    continueBinding = new Promise<void>((r) => {
      proceed = r;
    });
  class GateStore extends MongoCampaignStore {
    private intercept = true;
    override async transaction<T>(
      weddingId: ObjectId,
      authority: AuthSnapshot | null,
      work: (
        unit: import('../src/modules/campaigns/campaigns.types.js').CampaignUnit,
      ) => Promise<T>,
    ): Promise<T> {
      return super.transaction(weddingId, authority, async (unit) => {
        const read = unit.receipts;
        unit.receipts = async (id) => {
          if (!authority && this.intercept) {
            this.intercept = false;
            observed();
            await continueBinding;
          }
          return read(id);
        };
        return work(unit);
      });
    }
  }
  const gateStore = new GateStore(db.client, db.db),
    providerId = randomUUID(),
    gateService = new CampaignService(
      gateStore,
      links,
      vault,
      'resend',
      null,
      transport,
    ),
    worker = new InvitationEmailWorker(gateService, vault, {
      sendWithReceipt: async () => ({ outcome: 'accepted', providerId }),
    }),
    pending = worker.once();
  await entered;
  try {
    const receipt = {
      _id: randomUUID(),
      providerId,
      type: 'email.delivered',
      occurredAt: new Date(),
      receivedAt: new Date(),
    };
    await store.webhook(receipt, (j) => applyReceipt(j, receipt));
  } finally {
    proceed();
  }
  await pending;
  expect(
    (await store.dispatches(actor.wedding._id, new ObjectId(preview.id)))[0]!
      .delivery,
  ).toBe('delivered');
}, 30000);
