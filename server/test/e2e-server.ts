import { migrateInvitations } from '../src/migrations/004-family-invitations.js';
import { MongoInvitationStore } from '../src/modules/invitations/invitations.repository.js';
import { InvitationService } from '../src/modules/invitations/invitations.service.js';
import { InvitationVault } from '../src/modules/invitations/invitations.vault.js';
import { MemoryInvitationStore } from './helpers/memory-invitation-store.js';
import { migrateWebsite } from '../src/migrations/003-wedding-events.js';
import { MongoWebsiteStore } from '../src/modules/website/website.repository.js';
import { WebsiteService } from '../src/modules/website/website.service.js';
import { MemoryWebsiteStore } from './helpers/memory-website-store.js';
import { MemoryAuthStore } from './helpers/memory-auth-store.js';
import { MemoryAccessStore } from './helpers/memory-access-store.js';
import { rm } from 'node:fs/promises';
import { migrateAccess } from '../src/migrations/002-team-recovery.js';
import { MongoAccessStore } from '../src/modules/access/access.repository.js';
import { AccessService } from '../src/modules/access/access.service.js';
import { EmailVault, OutboxTransport } from '../src/infrastructure/email.js';
import { AuthEmailWorker } from '../src/jobs/auth-email.js';
import { e2eOutbox } from './helpers/e2e-outbox.js';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from './helpers/test-database.js';
import { migrateAuth } from '../src/migrations/001-auth-foundation.js';
import { MongoAuthStore } from '../src/modules/auth/auth.repository.js';
import { createAuthService } from '../src/modules/auth/auth.service.js';
import { createApp } from '../src/app.js';
import { createLogger } from '../src/infrastructure/logger.js';

// Dedicated ephemeral database; never serves or modifies the development wedding.
if (!process.env.AUTH_E2E_DATABASE_NAME)
  throw new Error('Run browser tests through the root Playwright command.');
const database =
  process.env.AUTH_E2E_MEMORY === '1'
    ? null
    : await createTestDatabase(process.env.AUTH_E2E_DATABASE_NAME);
const outbox = e2eOutbox(process.env.AUTH_E2E_DATABASE_NAME);
let worker: AuthEmailWorker | undefined;
try {
  if (database) {
    await migrateAuth(database.db);
    await migrateAccess(database.db);
    await migrateWebsite(database.db);
    await migrateInvitations(database.db);
  }
  const authStore = database
    ? new MongoAuthStore(database.client, database.db)
    : new MemoryAuthStore();
  const auth = await createAuthService(authStore);
  const accessStore = database
      ? new MongoAccessStore(database.client, database.db)
      : new MemoryAccessStore(authStore as MemoryAuthStore),
    vault = new EmailVault(Buffer.alloc(32, 4));
  const access = new AccessService(
    accessStore,
    auth,
    vault,
    'http://127.0.0.1:3101',
  );
  worker = new AuthEmailWorker(accessStore, vault, new OutboxTransport(outbox));
  const websiteStore = database
    ? new MongoWebsiteStore(database.client, database.db)
    : new MemoryWebsiteStore(authStore as MemoryAuthStore);
  const website = new WebsiteService(websiteStore);
  const invitations = new InvitationService(
    database
      ? new MongoInvitationStore(database.client, database.db)
      : new MemoryInvitationStore(websiteStore as MemoryWebsiteStore),
    new InvitationVault(Buffer.alloc(32, 7)),
    website,
    'http://127.0.0.1:3101',
  );
  const app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {
      if (database) await database.db.command({ ping: 1 });
    },
    clientDirectory: fileURLToPath(
      new URL('../../client/dist', import.meta.url),
    ),
    access,
    website,
    invitations,
    auth: {
      service: auth,
      options: {
        origin: 'http://127.0.0.1:3101',
        secure: false,
        csrfSecret: 'synthetic-browser-test-secret-at-least-32-characters',
      },
    },
  });
  const server = app.listen(3101, '127.0.0.1', () => {
    worker?.start();
    console.log('Isolated browser-test server ready.');
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.closeAllConnections();
    server.close();
    await worker?.stop();
    await database?.cleanup();
    await rm(outbox, { recursive: true, force: true });
  }
  process.once('SIGTERM', () => {
    void stop();
  });
  process.once('SIGINT', () => {
    void stop();
  });
  server.on('error', () => {
    void stop().finally(() => {
      process.exitCode = 1;
    });
  });
} catch {
  await worker?.stop();
  await database?.cleanup();
  await rm(outbox, { recursive: true, force: true });
  console.error(
    'Browser-test server setup failed. Check Atlas access and test database permissions.',
  );
  process.exitCode = 1;
}
