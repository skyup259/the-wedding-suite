import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { InvitationService } from '../src/modules/invitations/invitations.service.js';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryWebsiteStore } from './helpers/memory-website-store.js';
import { MemoryInvitationStore } from './helpers/memory-invitation-store.js';
const origin = 'http://localhost:5173';
const registration = {
  email: 'invitation-admin@example.test',
  password: 'a synthetic wedding passphrase',
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
  venue: { name: 'Garden', address: 'Test venue', mapUrl: '' },
  contacts: [{ name: 'Organiser', phone: '+919000000000' }],
  dressCode: '',
  instructions: '',
  status: 'not_started',
  sortOrder: 0,
  stream: null,
};
let authStore: MemoryAuthStore,
  websiteStore: MemoryWebsiteStore,
  store: MemoryInvitationStore,
  service: InvitationService,
  app: ReturnType<typeof createApp>,
  admin: ReturnType<typeof request.agent>,
  eventId: string,
  slug: string;
async function write(
  agent: ReturnType<typeof request.agent>,
  path: string,
  body: object = {},
  method: 'post' | 'patch' | 'delete' = 'post',
  revision?: number,
) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  let r = agent[method]('/api/v1/' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken);
  if (revision) r = r.set('If-Match', `"${revision}"`);
  return r.send(body);
}
const family = () => ({
  familyDisplayName: 'Test family',
  contactName: 'Private contact',
  phone: '+919000000001',
  eventIds: [eventId],
});
const create = async () => {
  const r = await write(admin, 'invitations', family());
  expect(r.status).toBe(201);
  return r.body.data;
};
async function publish() {
  const w = (await admin.get('/api/v1/wedding')).body.data;
  expect(
    (await write(admin, 'wedding/publish', {}, 'post', w.revision)).status,
  ).toBe(200);
}
const publicView = (token: string, weddingSlug = slug) =>
  request(app)
    .post(`/api/v1/public/weddings/${weddingSlug}/invitation-view`)
    .send({ token });
const share = async (id: string) => {
  const r = await write(admin, `invitations/${id}/share-link`);
  expect(r.status).toBe(200);
  return r.body.data;
};
const tokenFrom = (url: string) => url.split('/').at(-1)!;
beforeEach(async () => {
  authStore = new MemoryAuthStore();
  websiteStore = new MemoryWebsiteStore(authStore);
  store = new MemoryInvitationStore(websiteStore);
  const auth = await createAuthService(authStore),
    website = new WebsiteService(websiteStore);
  service = new InvitationService(
    store,
    new InvitationVault(Buffer.alloc(32, 7)),
    website,
    origin,
  );
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    website,
    invitations: service,
    auth: {
      service: auth,
      options: {
        origin,
        secure: false,
        csrfSecret: 'a-synthetic-test-csrf-secret-long-enough',
      },
    },
  });
  admin = request.agent(app);
  const r = await write(admin, 'auth/register', registration);
  slug = r.body.data.wedding.slug;
  eventId = (await write(admin, 'events', ceremony)).body.data.id;
});
describe('family invitations and estimates', () => {
  it('protects private routes and validates strict input and selected active same-wedding ceremonies', async () => {
    await request(app).get('/api/v1/invitations').expect(401);
    await admin.post('/api/v1/invitations').send(family()).expect(403);
    for (const input of [
      { ...family(), eventIds: [] },
      { ...family(), eventIds: [eventId, eventId] },
      { ...family(), eventIds: [new ObjectId().toHexString()] },
      { ...family(), weddingId: new ObjectId().toHexString() },
      { ...family(), rsvp: 'yes' },
    ])
      expect((await write(admin, 'invitations', input)).status).toBe(422);
    const i = await create();
    expect(i.sentStatus).toBe('not_sent');
    expect(JSON.stringify(i)).not.toMatch(/token|Ciphertext|KeyVersion/);
    expect((await write(admin, `invitations/${i.id}/share-link`)).status).toBe(
      409,
    );
  });
  it('recovers one stable encrypted link without marking Sent and exposes only personal greeting and the full public schedule', async () => {
    const i = await create();
    await publish();
    const s = await share(i.id),
      token = tokenFrom(s.url);
    expect((await share(i.id)).url).toBe(s.url);
    expect(s.message).toContain('Mehendi');
    expect(s.message).toContain('Asia/Kolkata');
    const saved = store.invitations.get(i.id)!;
    expect(saved.tokenCiphertext).not.toContain(token);
    expect(saved.tokenHash).not.toBe(token);
    await write(admin, 'events', { ...ceremony, name: 'Sangeet' });
    const view = await publicView(token);
    expect(view.status).toBe(200);
    expect(view.body.data.familyDisplayName).toBe(i.familyDisplayName);
    expect(view.body.data.selectedEventIds).toEqual([eventId]);
    expect(view.body.data.model.events).toHaveLength(2);
    expect(view.text).not.toMatch(
      /Private contact|9000000001|tokenHash|tokenCiphertext|revision|sentAt/,
    );
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.headers['x-robots-tag']).toContain('noindex');
    expect(view.headers['referrer-policy']).toBe('no-referrer');
    expect(
      (await admin.get('/api/v1/attendance-estimates')).body.data.sentFamilies,
    ).toBe(0);
    expect(
      (await request(app).get(`/api/v1/public/weddings/${slug}`)).text,
    ).not.toContain('Test family');
  });
  it('counts unique Sent families and event intersections; repeat sharing and repeat Sent preserve counts and timestamp', async () => {
    const i = await create();
    const j = await create();
    await publish();
    let r = await write(
      admin,
      `invitations/${i.id}/sent-status`,
      { sentStatus: 'sent' },
      'post',
      1,
    );
    expect(r.status).toBe(200);
    const firstTime = r.body.data.sentAt;
    r = await write(
      admin,
      `invitations/${i.id}/sent-status`,
      { sentStatus: 'sent' },
      'post',
      2,
    );
    expect(r.body.data.sentAt).toBe(firstTime);
    await share(i.id);
    await share(i.id);
    let estimate = (await admin.get('/api/v1/attendance-estimates')).body.data;
    expect(estimate).toMatchObject({
      totalFamilies: 2,
      sentFamilies: 1,
      attendees: { min: 2, max: 3 },
    });
    expect(estimate.events[0]).toMatchObject({
      sentFamilies: 1,
      min: 2,
      max: 3,
    });
    await write(
      admin,
      `invitations/${j.id}/sent-status`,
      { sentStatus: 'sent' },
      'post',
      1,
    );
    await write(
      admin,
      `invitations/${i.id}/sent-status`,
      { sentStatus: 'not_sent' },
      'post',
      3,
    );
    estimate = (await admin.get('/api/v1/attendance-estimates')).body.data;
    expect(estimate.sentFamilies).toBe(1);
    expect(
      (await admin.get(`/api/v1/invitations/${i.id}`)).body.data.sentAt,
    ).toBeNull();
  });
  it('rotates and archives links atomically without changing identity or inflating estimates', async () => {
    const i = await create();
    await publish();
    const old = tokenFrom((await share(i.id)).url);
    await write(
      admin,
      `invitations/${i.id}/sent-status`,
      { sentStatus: 'sent' },
      'post',
      1,
    );
    const rotated = await write(
      admin,
      `invitations/${i.id}/rotate-link`,
      {},
      'post',
      2,
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.share.url).not.toContain(old);
    const current = tokenFrom((await share(i.id)).url);
    expect(current).not.toBe(old);
    expect((await publicView(old)).status).toBe(404);
    expect((await publicView(current)).status).toBe(200);
    expect(
      (await admin.get('/api/v1/attendance-estimates')).body.data.sentFamilies,
    ).toBe(1);
    expect(
      (await write(admin, `invitations/${i.id}`, {}, 'delete', 3)).status,
    ).toBe(204);
    expect((await publicView(current)).status).toBe(404);
    expect(
      (await admin.get('/api/v1/attendance-estimates')).body.data.sentFamilies,
    ).toBe(0);
    expect(store.invitations.get(i.id)!.archivedAt).not.toBeNull();
  });
  it('rejects stale/missing revisions, rolls back audit failures, and permits only one competing edit', async () => {
    const i = await create();
    expect(
      (await write(admin, `invitations/${i.id}`, { contactName: 'A' }, 'patch'))
        .status,
    ).toBe(428);
    const results = await Promise.all([
      write(admin, `invitations/${i.id}`, { contactName: 'A' }, 'patch', 1),
      write(admin, `invitations/${i.id}`, { contactName: 'B' }, 'patch', 1),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
    store.failAudit = true;
    expect(
      (
        await write(
          admin,
          `invitations/${i.id}`,
          { contactName: 'Failed' },
          'patch',
          2,
        )
      ).status,
    ).toBe(500);
    expect(store.invitations.get(i.id)!.revision).toBe(2);
    expect(store.invitations.get(i.id)!.contactName).not.toBe('Failed');
    expect(store.invitations.get(i.id)!.phone).toBe('+919000000001');
  });
  it('scopes lists, filters, IDs, selections, cursors and token views to the wedding', async () => {
    const i = await create();
    await create();
    await publish();
    const token = tokenFrom((await share(i.id)).url);
    const other = request.agent(app);
    const second = await write(other, 'auth/register', {
      ...registration,
      email: 'other-family-admin@example.test',
    });
    const otherSlug = second.body.data.wedding.slug;
    const foreignEvent = (await write(other, 'events', ceremony)).body.data.id;
    for (const path of [
      `invitations/${i.id}`,
      `invitations/${i.id}/share-link`,
    ]) {
      const r = path.endsWith('share-link')
        ? await write(other, path)
        : await other.get('/api/v1/' + path);
      expect(r.status).toBe(404);
    }
    expect(
      (
        await write(
          other,
          `invitations/${i.id}`,
          { contactName: 'Intruder' },
          'patch',
          1,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(
          other,
          `invitations/${i.id}/sent-status`,
          { sentStatus: 'sent' },
          'post',
          1,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await write(admin, 'invitations', {
          ...family(),
          eventIds: [foreignEvent],
        })
      ).status,
    ).toBe(422);
    expect((await other.get('/api/v1/invitations')).body.data).toEqual([]);
    expect((await publicView(token, otherSlug)).status).toBe(404);
    const first = await admin.get('/api/v1/invitations?limit=1');
    expect(first.body.meta.hasMore).toBe(true);
    const cursor = encodeURIComponent(first.body.meta.nextCursor);
    const next = await admin.get(
      `/api/v1/invitations?limit=1&cursor=${cursor}`,
    );
    expect(next.status).toBe(200);
    expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
    await admin
      .get(`/api/v1/invitations?limit=1&search=changed&cursor=${cursor}`)
      .expect(400);
    await other.get(`/api/v1/invitations?limit=1&cursor=${cursor}`).expect(400);
    await admin.get('/api/v1/invitations?limit=1000').expect(422);
    await admin.get('/api/v1/invitations?cursor=bad').expect(400);
    expect(
      (await admin.get('/api/v1/invitations?search=%5B')).body.data,
    ).toEqual([]);
    expect(
      (await admin.get(`/api/v1/invitations?eventId=${eventId}`)).body.data,
    ).toHaveLength(2);
  });
  it('retains archived references, excludes archived highlights and event estimates, and hides personal content on unpublish', async () => {
    const i = await create();
    await write(admin, 'events', { ...ceremony, name: 'Remaining event' });
    await publish();
    const token = tokenFrom((await share(i.id)).url);
    await write(
      admin,
      `invitations/${i.id}/sent-status`,
      { sentStatus: 'sent' },
      'post',
      1,
    );
    expect(
      (await write(admin, `events/${eventId}`, {}, 'delete', 1)).status,
    ).toBe(409);
    expect(
      (
        await write(
          admin,
          `events/${eventId}?confirmReferenced=true`,
          {},
          'delete',
          1,
        )
      ).status,
    ).toBe(204);
    const view = await publicView(token);
    expect(view.body.data.selectedEventIds).toEqual([]);
    expect(view.body.data.model.events).toHaveLength(1);
    expect(
      (await admin.get(`/api/v1/invitations/${i.id}`)).body.data
        .archivedEventIds,
    ).toEqual([eventId]);
    const overview = (await admin.get('/api/v1/attendance-estimates')).body
      .data;
    expect(overview.sentFamilies).toBe(1);
    expect(overview.events).toHaveLength(1);
    expect(overview.events[0].sentFamilies).toBe(0);
    expect(
      (
        await write(
          admin,
          `invitations/${i.id}`,
          { contactName: 'Updated contact' },
          'patch',
          2,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await write(
          admin,
          `invitations/${i.id}`,
          { eventIds: [eventId] },
          'patch',
          3,
        )
      ).status,
    ).toBe(422);
    const w = (await admin.get('/api/v1/wedding')).body.data;
    await write(admin, 'wedding/unpublish', {}, 'post', w.revision);
    expect((await publicView(token)).status).toBe(404);
  });
  it('allows Managers, rechecks disabled authority, fails closed before migration and safely handles a wrong recovery key', async () => {
    [...authStore.users.values()][0]!.role = 'manager';
    const i = await create();
    await publish();
    await share(i.id);
    const actor = {
      user: [...authStore.users.values()][0]!,
      wedding: [...authStore.weddings.values()][0]!,
    };
    const otherKey = new InvitationService(
      store,
      new InvitationVault(Buffer.alloc(32, 9)),
      new WebsiteService(websiteStore),
      origin,
    );
    await expect(otherKey.share(actor, i.id)).rejects.toMatchObject({
      code: 'INVITATION_LINK_UNAVAILABLE',
    });
    store.migrated = false;
    await admin.get('/api/v1/invitations').expect(503);
    store.migrated = true;
    actor.user.status = 'disabled';
    await expect(
      service.change(actor, i.id, 1, 'archive', undefined),
    ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await admin.get('/api/v1/invitations').expect(401);
  });
  it('returns generic invalid capability errors and rate-limits public exchanges', async () => {
    for (const token of ['', 'bad', 'a'.repeat(64)])
      expect((await publicView(token)).status).toBe(404);
    for (let n = 0; n < 57; n++) await publicView('b'.repeat(64));
    const rate = await publicView('b'.repeat(64));
    expect(rate.status).toBe(429);
    expect(rate.headers['retry-after']).toBeDefined();
  });
});
