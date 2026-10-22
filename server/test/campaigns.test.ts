import { beforeEach, it, expect, vi } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import type { AuthSnapshot } from '../src/modules/auth/auth.types.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { InvitationService } from '../src/modules/invitations/invitations.service.js';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
import { EmailVault, EmailFailure } from '../src/infrastructure/email.js';
import {
  CampaignService,
  retryWindow,
} from '../src/modules/campaigns/campaigns.service.js';
import type { CampaignTransport } from '../src/modules/campaigns/campaigns.types.js';
import { InvitationEmailWorker } from '../src/jobs/invitation-email.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryWebsiteStore } from './helpers/memory-website-store.js';
import { MemoryInvitationStore } from './helpers/memory-invitation-store.js';
import { MemoryCampaignStore } from './helpers/memory-campaign-store.js';
const origin = 'http://localhost:5173',
  secret = 'whsec_' + Buffer.alloc(32, 3).toString('base64');
const registration = {
  email: 'email-admin@example.test',
  password: 'a synthetic email passphrase',
  displayName: 'Admin',
  wedding: {
    couple: { partner1Name: 'Test A', partner2Name: 'Test B' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    themeId: 'traditional',
  },
};
const ceremony = {
  name: 'Mehendi',
  description: '',
  startAt: '2026-12-30T10:00:00.000Z',
  endAt: null,
  venue: { name: 'Garden', address: 'Synthetic venue', mapUrl: '' },
  contacts: [{ name: 'Organiser', phone: '+919000000000' }],
  dressCode: '',
  instructions: '',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
};
let app: ReturnType<typeof createApp>,
  admin: ReturnType<typeof request.agent>,
  actor: AuthSnapshot,
  website: WebsiteService,
  links: InvitationService,
  store: MemoryCampaignStore,
  service: CampaignService,
  worker: InvitationEmailWorker,
  now: Date,
  eventId: string,
  vault: EmailVault,
  transport: CampaignTransport;
const send = vi.fn();
async function write(
  agent: typeof admin,
  path: string,
  body: object = {},
  revision?: number,
) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  let r = agent
    .post('/api/v1/' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken);
  if (revision) r = r.set('If-Match', `"${revision}"`);
  return r.send(body);
}
async function family(n = 0, email = `family-${n}@example.test`) {
  return links.create(actor, {
    familyDisplayName: `Family ${n}`,
    contactName: 'Private contact',
    phone: '+919000000001',
    email,
    eventIds: [eventId],
  });
}
async function preview(ids: string[]) {
  return service.preview(
    actor,
    ids.map((id) => new ObjectId(id)),
    'test',
  );
}
async function confirmed(n = 0) {
  const i = await family(n),
    b = await preview([i.id]);
  await service.confirm(actor, new ObjectId(b.id), b.revision, 'test');
  return {
    i,
    b,
    job: [...store.jobs.values()].find((j) => String(j.batchId) === b.id)!,
  };
}
beforeEach(async () => {
  now = new Date('2026-10-19T10:00:00Z');
  send.mockReset();
  send.mockResolvedValue({ outcome: 'accepted', providerId: randomUUID() });
  transport = { sendWithReceipt: send };
  const authStore = new MemoryAuthStore(),
    auth = await createAuthService(authStore),
    websiteStore = new MemoryWebsiteStore(authStore);
  website = new WebsiteService(websiteStore, () => now);
  links = new InvitationService(
    new MemoryInvitationStore(websiteStore),
    new InvitationVault(Buffer.alloc(32, 7)),
    website,
    origin,
    () => now,
  );
  store = new MemoryCampaignStore(links.store as MemoryInvitationStore);
  vault = new EmailVault(Buffer.alloc(32, 5));
  service = new CampaignService(
    store,
    links,
    vault,
    'resend',
    null,
    transport,
    () => now,
  );
  worker = new InvitationEmailWorker(service, vault, transport, () => now);
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    website,
    invitations: links,
    campaigns: service,
    resendWebhookSecret: secret,
    auth: {
      service: auth,
      options: {
        origin,
        secure: false,
        csrfSecret: 'a-synthetic-csrf-secret-with-at-least-32-characters',
      },
    },
  });
  admin = request.agent(app);
  expect((await write(admin, 'auth/register', registration)).status).toBe(201);
  actor = {
    user: [...authStore.users.values()][0]!,
    wedding: [...authStore.weddings.values()][0]!,
  };
  eventId = (await website.event(actor, ceremony)).id;
  await website.publish(
    actor,
    (await website.read(actor)).wedding.revision,
    true,
  );
});
it('protects management routes, validates selected IDs/email and keeps contact email out of personal views', async () => {
  await request(app).get('/api/v1/email-batches').expect(401);
  await admin
    .post('/api/v1/email-batches/preview')
    .send({ invitationIds: [] })
    .expect(403);
  expect(
    (await write(admin, 'email-batches/preview', { invitationIds: [] })).status,
  ).toBe(422);
  const missing = await family(0, '');
  await expect(preview([missing.id])).rejects.toMatchObject({
    code: 'EMAIL_REQUIRED',
  });
  const i = await family(1);
  const p = await preview([i.id]);
  expect(p.items[0]!.to).toBe('family-1@example.test');
  expect(p.items[0]!.text).toContain('Mehendi');
  expect(store.jobs.size).toBe(0);
  const share = await links.share(actor, i.id),
    view = await links.publicView(
      actor.wedding.slug,
      share.url.split('/').at(-1)!,
    );
  expect(JSON.stringify(view)).not.toContain('family-1@example.test');
});
it('confirms exactly once, reserves once, returns queued results and never creates an explicit resend', async () => {
  const i = await family(),
    p = await preview([i.id]);
  const results = await Promise.all([
    service.confirm(actor, new ObjectId(p.id), 1, 'test'),
    service.confirm(actor, new ObjectId(p.id), 1, 'test'),
  ]);
  expect(results.map((r) => r.status)).toEqual(['confirmed', 'confirmed']);
  expect(results[0]!.dispatches).toHaveLength(1);
  expect(store.jobs.size).toBe(1);
  expect([...store.quotas.values()][0]!.first).toBe(1);
  expect((await links.estimates(actor)).sentFamilies).toBe(0);
  await expect(preview([i.id])).rejects.toMatchObject({
    code: 'RESENDS_DISABLED',
  });
  expect(JSON.stringify([...store.jobs.values()])).not.toContain(
    p.items[0]!.to!,
  );
  expect([...store.batchesMap.values()][0]!.items[0]!.payload).toBeNull();
});
it('reserves at most 25 across concurrent batches and keeps its quota timezone after wedding edits', async () => {
  const ids = [];
  for (let n = 0; n < 30; n++) ids.push((await family(n)).id);
  const a = await preview(ids.slice(0, 20)),
    b = await preview(ids.slice(20)),
    results = await Promise.allSettled([
      service.confirm(actor, new ObjectId(a.id), 1, 'test'),
      service.confirm(actor, new ObjectId(b.id), 1, 'test'),
    ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(store.jobs.size).toBe(20);
  const w = (await website.read(actor)).wedding;
  await website.patch(actor, { timezone: 'America/New_York' }, w.revision);
  const p = await preview(ids.slice(20, 25));
  expect(p.quota.timezone).toBe('Asia/Kolkata');
  expect(p.quota.firstRemaining).toBe(5);
  await service.confirm(actor, new ObjectId(p.id), 1, 'test');
  expect(store.jobs.size).toBe(25);
  now = new Date(+now + 24 * 3600000);
  const next = await preview(ids.slice(25));
  expect(next.quota.firstRemaining).toBe(25);
});
it('rejects stale, expired and changed-mode previews and rolls back quota/jobs/invitations on late audit failure', async () => {
  const i = await family(),
    p = await preview([i.id]);
  await links.change(actor, i.id, 1, 'edit', { contactName: 'Changed' });
  await expect(
    service.confirm(actor, new ObjectId(p.id), 1, 'test'),
  ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  const fresh = await preview([i.id]);
  store.failAudit = true;
  await expect(
    service.confirm(actor, new ObjectId(fresh.id), 1, 'test'),
  ).rejects.toThrow('Synthetic');
  expect(store.jobs.size).toBe(0);
  expect(store.quotas.size).toBe(0);
  store.failAudit = false;
  now = new Date(+now + 16 * 60000);
  await expect(
    service.confirm(actor, new ObjectId(fresh.id), 1, 'test'),
  ).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' });
  await store.sweep(now);
  expect(store.batchesMap.get(fresh.id)!.items[0]!.payload).toBeNull();
});
it('marks Sent only on provider acceptance, preserves unique estimates and clears terminal payloads', async () => {
  const { i, job } = await confirmed();
  await worker.once();
  const saved = store.jobs.get(String(job._id))!;
  expect(saved.status).toBe('accepted');
  expect(saved.payload).toBeNull();
  expect((await links.estimates(actor)).sentFamilies).toBe(1);
  expect(send).toHaveBeenCalledTimes(1);
  await worker.once();
  expect(send).toHaveBeenCalledTimes(1);
  expect((await links.get(actor, i.id)).sentAt).not.toBeNull();
  const outboxService = new CampaignService(
      store,
      links,
      vault,
      'outbox',
      null,
      {
        sendWithReceipt: async () => ({ outcome: 'outbox', providerId: null }),
      },
      () => now,
    ),
    outboxWorker = new InvitationEmailWorker(
      outboxService,
      vault,
      outboxService.transport!,
      () => now,
    );
  const next = await family(2),
    p = await outboxService.preview(actor, [new ObjectId(next.id)], 'test');
  await outboxService.confirm(actor, new ObjectId(p.id), 1, 'test');
  await outboxWorker.once();
  expect((await links.get(actor, next.id)).sentStatus).toBe('not_sent');
});
it('retries transient outcomes with identical message/key, fences stale workers and stops after the provider retry window', async () => {
  const { job } = await confirmed();
  send.mockRejectedValueOnce(new EmailFailure('PROVIDER_UNAVAILABLE'));
  await worker.once();
  expect(store.jobs.get(String(job._id))!.status).toBe('queued');
  now = new Date(+now + 31000);
  await worker.once();
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(store.jobs.get(String(job._id))!.status).toBe('accepted');
  const other = await confirmed(2);
  send.mockImplementationOnce(async () => {
    now = new Date(+now + 61000);
    await store.claim('another-worker', now);
    return { outcome: 'accepted', providerId: randomUUID() };
  });
  await worker.once();
  expect(store.jobs.get(String(other.job._id))!.status).toBe('running');
  now = new Date(+now + retryWindow);
  await worker.once();
  const uncertain = store.jobs.get(String(other.job._id))!;
  expect(uncertain.status).toBe('unknown');
  expect(uncertain.payload).toBeNull();
});
it('allows safe original retries only while preserving the reviewed content, and cancels stale queued messages', async () => {
  const { i, job } = await confirmed();
  send.mockRejectedValueOnce(new EmailFailure('PROVIDER_REJECTED', true));
  await worker.once();
  const failed = store.jobs.get(String(job._id))!;
  expect(failed.status).toBe('failed');
  await service.retry(actor, job._id, failed.revision, 'test');
  await worker.once();
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  const next = await confirmed(3);
  const current = await links.get(actor, next.i.id);
  await links.change(actor, next.i.id, current.revision, 'rotate', undefined);
  await worker.once();
  expect(store.jobs.get(String(next.job._id))!.status).toBe('cancelled');
  expect((await links.get(actor, i.id)).sentStatus).toBe('sent');
});
it('does not overwrite an intervening manual status/content edit after an in-flight provider call', async () => {
  const { i, job } = await confirmed();
  send.mockImplementationOnce(async () => {
    const current = await links.get(actor, i.id);
    await links.change(actor, i.id, current.revision, 'edit', {
      contactName: 'Changed while sending',
    });
    return { outcome: 'accepted', providerId: randomUUID() };
  });
  await worker.once();
  expect(store.jobs.get(String(job._id))!.status).toBe('accepted');
  expect((await links.get(actor, i.id)).sentStatus).toBe('not_sent');
});
it('verifies raw webhook signatures, rejects tampering and deduplicates replays and handles early/duplicate/out-of-order events without storing contacts', async () => {
  const providerId = randomUUID(),
    { job } = await confirmed();
  async function webhook(type: string, id = randomUUID(), tamper = false) {
    const date = new Date(),
      payload = JSON.stringify({
        type,
        created_at: date.toISOString(),
        data: { email_id: providerId, to: ['private@example.test'] },
      }),
      signature = new Webhook(secret).sign(id, date, payload);
    return request(app)
      .post('/api/v1/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', String(Math.floor(+date / 1000)))
      .set('svix-signature', signature)
      .send(tamper ? payload + ' ' : payload);
  }
  expect((await webhook('email.delivered', randomUUID(), true)).status).toBe(
    401,
  );
  const id = randomUUID();
  expect((await webhook('email.delivered', id)).status).toBe(204);
  expect((await webhook('email.delivered', id)).status).toBe(204);
  send.mockResolvedValue({ outcome: 'accepted', providerId });
  await worker.once();
  expect(store.jobs.get(String(job._id))!.delivery).toBe('delivered');
  expect((await webhook('email.sent')).status).toBe(204);
  expect(store.jobs.get(String(job._id))!.delivery).toBe('delivered');
  expect((await webhook('email.bounced')).status).toBe(204);
  expect((await webhook('email.delivered')).status).toBe(204);
  expect(store.jobs.get(String(job._id))!.delivery).toBe('bounced');
  expect(JSON.stringify([...store.receiptsMap.values()])).not.toContain(
    'private@example.test',
  );
  expect((await links.estimates(actor)).sentFamilies).toBe(1);
});
it('denies cross-wedding batch/dispatch actions and current disabled authority', async () => {
  const { b, job } = await confirmed(),
    other = request.agent(app);
  await write(other, 'auth/register', {
    ...registration,
    email: 'other-email-admin@example.test',
  });
  await other.get(`/api/v1/email-batches/${b.id}`).expect(404);
  expect(
    (await write(other, `email-batches/${b.id}/confirm`, {}, 1)).status,
  ).toBe(404);
  expect(
    (await write(other, `email-dispatches/${job._id}/retry`, {}, 1)).status,
  ).toBe(404);
  actor.user.status = 'disabled';
  await admin.get('/api/v1/email-batches').expect(401);
});

it('reconciles an unknown result only against an exact provider message and never retries unknown sends', async () => {
  const { job } = await confirmed(),
    mail = vault.open(job.payload!, String(job._id));
  store.jobs.get(String(job._id))!.attempts = 7;
  send.mockRejectedValue(new EmailFailure('PROVIDER_UNAVAILABLE'));
  await worker.once();
  const unknown = store.jobs.get(String(job._id))!;
  expect(unknown.status).toBe('unknown');
  await expect(
    service.retry(actor, job._id, unknown.revision, 'test'),
  ).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });
  const providerId = randomUUID();
  transport.retrieve = async () => ({
    ...mail,
    to: [mail.to],
    subject: 'Wrong subject',
    createdAt: now,
    lastEvent: 'delivered',
  });
  await expect(
    service.reconcile(actor, job._id, unknown.revision, providerId, 'test'),
  ).rejects.toMatchObject({ code: 'PROVIDER_MISMATCH' });
  transport.retrieve = async () => ({
    ...mail,
    to: [mail.to],
    createdAt: now,
    lastEvent: 'delivered',
  });
  const reconciled = await service.reconcile(
    actor,
    job._id,
    unknown.revision,
    providerId,
    'test',
  );
  expect(reconciled.status).toBe('accepted');
  expect(reconciled.delivery).toBe('delivered');
  expect((await links.estimates(actor)).sentFamilies).toBe(1);
});

it('rejects expired signatures and safely ignores signed unrelated provider event types', async () => {
  const payload = JSON.stringify({ type: 'contact.created', data: {} }),
    id = randomUUID();
  async function event(date: Date) {
    return request(app)
      .post('/api/v1/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', String(Math.floor(+date / 1000)))
      .set('svix-signature', new Webhook(secret).sign(id, date, payload))
      .send(payload);
  }
  expect((await event(new Date(Date.now() - 600000))).status).toBe(401);
  expect((await event(new Date())).status).toBe(204);
  expect(store.receiptsMap.size).toBe(0);
});
