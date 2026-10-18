import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryWebsiteStore } from './helpers/memory-website-store.js';
import { guestHtml } from '../src/middleware/frontend.js';
const origin = 'http://localhost:5173';
const registration = {
  email: 'website-admin@example.test',
  password: 'a synthetic wedding passphrase',
  displayName: 'Admin',
  wedding: {
    couple: { partner1Name: 'Avani', partner2Name: 'Swar' },
    mainDate: '2026-12-31',
    timezone: 'Asia/Kolkata',
    themeId: 'traditional',
  },
};
export const ceremony = {
  name: 'Mehendi',
  description: 'Join us.',
  startAt: '2026-12-30T10:00:00.000Z',
  endAt: null,
  venue: {
    name: 'Garden',
    address: 'Test wedding venue',
    mapUrl: 'https://maps.google.com/',
  },
  contacts: [{ name: 'Organiser', phone: '+919000000000' }],
  dressCode: 'Festive',
  instructions: 'Arrive a little early.',
  status: 'not_started' as const,
  sortOrder: 0,
  stream: null,
};
let store: MemoryWebsiteStore,
  authStore: MemoryAuthStore,
  service: WebsiteService,
  app: ReturnType<typeof createApp>,
  admin: ReturnType<typeof request.agent>,
  slug: string,
  now: Date;
async function write(
  agent: ReturnType<typeof request.agent>,
  path: string,
  body: object = {},
  method: 'post' | 'patch' | 'put' | 'delete' = 'post',
  revision?: number,
) {
  const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
  let req = agent[method]('/api/v1/' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.data.csrfToken);
  if (revision) req = req.set('If-Match', `"${revision}"`);
  return req.send(body);
}
const wedding = async () =>
  (await admin.get('/api/v1/wedding').expect(200)).body.data;
async function publish() {
  await write(admin, 'events', ceremony);
  const w = await wedding();
  const result = await write(admin, 'wedding/publish', {}, 'post', w.revision);
  expect(result.status).toBe(200);
  return result.body.data;
}
beforeEach(async () => {
  now = new Date('2026-12-30T09:00:00Z');
  authStore = new MemoryAuthStore();
  store = new MemoryWebsiteStore(authStore);
  service = new WebsiteService(store, () => now);
  app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {},
    website: service,
    auth: {
      service: await createAuthService(authStore, 86400, () => now),
      options: {
        origin,
        secure: false,
        csrfSecret: 'a-test-csrf-secret-more-than-32-characters',
      },
    },
  });
  admin = request.agent(app);
  const created = await write(admin, 'auth/register', registration);
  expect(created.status).toBe(201);
  slug = created.body.data.wedding.slug;
});
describe('wedding website, events and publication', () => {
  it('protects drafts and private configuration while permitting team preview', async () => {
    await request(app).get('/api/v1/wedding').expect(401);
    await request(app).get(`/api/v1/public/weddings/${slug}`).expect(404);
    await write(admin, 'events', ceremony);
    const preview = await admin.get('/api/v1/wedding/preview').expect(200);
    expect(preview.body.data.events[0].name).toBe('Mehendi');
    expect(preview.body.meta.weddingRevision).toBe(2);
    expect(preview.text).not.toMatch(
      /passwordHash|privateToken|createdBy|emailNormalized|updatedBy|sessionVersion/,
    );
    expect(preview.headers['cache-control']).toBe('no-store');
  });
  it('validates publication and enforces current revisions and CSRF', async () => {
    expect((await write(admin, 'wedding/publish', {}, 'post', 1)).status).toBe(
      422,
    );
    expect((await write(admin, 'wedding/publish')).status).toBe(428);
    await write(admin, 'events', { ...ceremony, contacts: [] });
    const current = await wedding();
    expect(
      (await write(admin, 'wedding/publish', {}, 'post', current.revision))
        .status,
    ).toBe(422);
    await admin
      .patch('/api/v1/wedding')
      .set('Origin', origin)
      .send({ mainDate: '2027-01-01' })
      .expect(403);
    expect(
      (
        await write(
          admin,
          'wedding',
          { slug: 'unsafe' },
          'patch',
          current.revision,
        )
      ).status,
    ).toBe(422);
  });
  it('publishes safe guest content, locks the slug across date changes and hides all public endpoints on unpublish', async () => {
    const w = await publish();
    let guest = await request(app)
      .get(`/api/v1/public/weddings/${slug}`)
      .expect(200);
    expect(guest.text).not.toMatch(
      /revision|photoExpiry|retentionVersion|createdBy|privateLink|password|email|updatedBy/,
    );
    const edited = await write(
      admin,
      'wedding',
      { mainDate: '2027-01-01' },
      'patch',
      w.revision,
    );
    expect(edited.status).toBe(200);
    expect(edited.body.data.slug).toBe(slug);
    expect(edited.body.data.photoExpiryAt).not.toBe(w.photoExpiryAt);
    expect(
      (
        await write(
          admin,
          'wedding/unpublish',
          {},
          'post',
          edited.body.data.revision,
        )
      ).status,
    ).toBe(200);
    for (const suffix of ['', '/events', '/today'])
      await request(app)
        .get(`/api/v1/public/weddings/${slug}${suffix}`)
        .expect(404);
    guest = await request(app).get(`/api/v1/public/weddings/${slug}`);
    expect(guest.text).not.toContain('Avani');
  });
  it('updates all themes without changing content or published links', async () => {
    await publish();
    for (const themeId of ['traditional', 'floral', 'minimal']) {
      const w = await wedding();
      const saved = await write(
        admin,
        'wedding',
        { website: { ...w.website, themeId, intro: 'We welcome you.' } },
        'patch',
        w.revision,
      );
      expect(saved.status).toBe(200);
      const model = (await request(app).get(`/api/v1/public/weddings/${slug}`))
        .body.data;
      expect(model.wedding.website.themeId).toBe(themeId);
      expect(model.events[0].name).toBe('Mehendi');
      expect(model.wedding.slug).toBe(slug);
    }
  });
  it('keeps statuses manual, shows every overlapping active ceremony and computes next/overdue using actual instants', async () => {
    const a = await write(admin, 'events', ceremony);
    await write(admin, 'events', {
      ...ceremony,
      name: 'Sangeet',
      startAt: '2026-12-30T09:30:00.000Z',
      status: 'in_progress',
    });
    await write(admin, 'events', {
      ...ceremony,
      name: 'Haldi',
      startAt: '2026-12-30T09:15:00.000Z',
      status: 'in_progress',
    });
    let w = await wedding();
    await write(admin, 'wedding/publish', {}, 'post', w.revision);
    let today = (
      await request(app).get(`/api/v1/public/weddings/${slug}/today`)
    ).body.data;
    expect(today.active).toHaveLength(2);
    expect(today.next).toBe(a.body.data.id);
    now = new Date('2026-12-30T11:00:00Z');
    today = (await request(app).get(`/api/v1/public/weddings/${slug}/today`))
      .body.data;
    expect(today.overdue).toContain(a.body.data.id);
    expect(
      (await admin.get('/api/v1/events')).body.data.find(
        (e: { id: string }) => e.id === a.body.data.id,
      ).status,
    ).toBe('not_started');
    w = await wedding();
    await write(
      admin,
      'wedding/announcement',
      { message: 'Venue entrance moved.' },
      'put',
      w.revision,
    );
    expect(
      (await request(app).get(`/api/v1/public/weddings/${slug}`)).body.data
        .wedding.latestAnnouncement.message,
    ).toBe('Venue entrance moved.');
  });
  it('rejects stale event and wedding edits and validates merged partial event changes', async () => {
    const created = await write(admin, 'events', ceremony),
      id = created.body.data.id;
    expect(
      (
        await write(
          admin,
          `events/${id}`,
          { status: 'in_progress' },
          'patch',
          1,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await write(
          admin,
          `events/${id}`,
          { name: 'Stale overwrite' },
          'patch',
          1,
        )
      ).status,
    ).toBe(412);
    expect(
      (
        await write(
          admin,
          `events/${id}`,
          { endAt: '2026-01-01T00:00:00.000Z' },
          'patch',
          2,
        )
      ).status,
    ).toBe(422);
    expect(
      (await write(admin, 'wedding', { mainDate: '2027-01-01' }, 'patch', 1))
        .status,
    ).toBe(412);
  });
  it('keeps private event IDs scoped to the caller wedding', async () => {
    const created = await write(admin, 'events', ceremony),
      other = request.agent(app);
    await write(other, 'auth/register', {
      ...registration,
      email: 'another@example.test',
    });
    await other.get(`/api/v1/events/${created.body.data.id}`).expect(404);
    expect(
      (
        await write(
          other,
          `events/${created.body.data.id}`,
          { name: 'Wrong wedding' },
          'patch',
          1,
        )
      ).status,
    ).toBe(404);
    expect((await other.get('/api/v1/events')).body.data).toEqual([]);
  });
  it('archives without deleting history and requires explicit referenced confirmation', async () => {
    const created = await write(admin, 'events', ceremony),
      id = created.body.data.id;
    store.references = { invitations: 2 };
    const refused = await write(admin, `events/${id}`, {}, 'delete', 1);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('RESOURCE_REFERENCED');
    expect(
      (
        await write(
          admin,
          `events/${id}?confirmReferenced=true`,
          {},
          'delete',
          1,
        )
      ).status,
    ).toBe(204);
    expect((await admin.get('/api/v1/events')).body.data).toEqual([]);
    expect(
      (await admin.get('/api/v1/events?includeArchived=true')).body.data[0]
        .archivedAt,
    ).not.toBeNull();
  });
  it('rolls back failed audit mutations and stops retention extension after cleanup begins', async () => {
    store.failAudit = true;
    expect((await write(admin, 'events', ceremony)).status).toBe(500);
    expect(store.events.size).toBe(0);
    expect((await wedding()).revision).toBe(1);
    store.failAudit = false;
    const w = [...authStore.weddings.values()][0]!;
    w.mediaCleanup.state = 'running';
    expect(
      (await write(admin, 'wedding', { mainDate: '2027-01-01' }, 'patch', 1))
        .status,
    ).toBe(409);
    expect((await wedding()).mainDate).toBe('2026-12-31');
  });
  it('denies disabled accounts and fails closed before migration 003', async () => {
    store.migrated = false;
    await admin.get('/api/v1/wedding').expect(503);
    store.migrated = true;
    [...authStore.users.values()][0]!.status = 'disabled';
    await admin.get('/api/v1/events').expect(401);
  });
  it('renders escaped per-wedding metadata without including management details', async () => {
    await publish();
    const model = await service.public(slug);
    model.wedding.couple.partner1Name = '<script>alert(1)</script>';
    model.wedding.website.intro = 'A "quote" & <tag>';
    const html = guestHtml(
      '<head><title>The Wedding Suite</title><meta name="description" content="foundation" /></head>',
      model,
      'https://example.test',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quote&quot;');
    expect(html).toContain('og:title');
    expect(html).not.toContain('foundation');
  });
  it('allows a Manager to edit operational content and publish without team-access privileges', async () => {
    const user = [...authStore.users.values()][0]!;
    user.role = 'manager';
    await write(admin, 'events', ceremony);
    const w = await wedding();
    expect(
      (await write(admin, 'wedding/publish', {}, 'post', w.revision)).status,
    ).toBe(200);
    expect(
      (
        await write(
          admin,
          'wedding',
          { website: { ...w.website, intro: 'Saved by a Manager.' } },
          'patch',
          w.revision + 1,
        )
      ).status,
    ).toBe(200);
  });
  it('preserves a collision-suffixed draft address when saving unrelated content', async () => {
    const other = request.agent(app);
    const created = await write(other, 'auth/register', {
      ...registration,
      email: 'same-names@example.test',
    });
    const secondSlug = created.body.data.wedding.slug;
    expect(secondSlug).not.toBe(slug);
    const current = (await other.get('/api/v1/wedding')).body.data;
    const saved = await write(
      other,
      'wedding',
      { website: { ...current.website, intro: 'A second celebration.' } },
      'patch',
      current.revision,
    );
    expect(saved.status).toBe(200);
    expect(saved.body.data.slug).toBe(secondSlug);
  });
  it('whitelists nested public fields and always falls back from unmanaged cover references', async () => {
    await publish();
    const record = [...authStore.weddings.values()][0]!;
    Object.assign(record.couple, { privateNote: 'SHOULD_NOT_APPEAR' });
    Object.assign(record.website, {
      privateNote: 'SHOULD_NOT_APPEAR',
      coverPhotoId: 'private-cover',
    });
    const event = [...store.events.values()][0]!;
    Object.assign(event.venue, { privateNote: 'SHOULD_NOT_APPEAR' });
    Object.assign(event.contacts[0]!, { privateNote: 'SHOULD_NOT_APPEAR' });
    const response = await request(app)
      .get(`/api/v1/public/weddings/${slug}`)
      .expect(200);
    expect(response.text).not.toContain('SHOULD_NOT_APPEAR');
    expect(response.body.data.wedding.website.coverPhotoId).toBeNull();
  });
});
