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
const database = await createTestDatabase(process.env.AUTH_E2E_DATABASE_NAME);
try {
  await migrateAuth(database.db);
  const app = createApp({
    logger: createLogger('silent'),
    checkReady: async () => {
      await database.db.command({ ping: 1 });
    },
    clientDirectory: fileURLToPath(
      new URL('../../client/dist', import.meta.url),
    ),
    auth: {
      service: await createAuthService(
        new MongoAuthStore(database.client, database.db),
      ),
      options: {
        origin: 'http://127.0.0.1:3101',
        secure: false,
        csrfSecret: 'synthetic-browser-test-secret-at-least-32-characters',
      },
    },
  });
  const server = app.listen(3101, '127.0.0.1', () => {
    console.log('Isolated browser-test server ready.');
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    server.closeAllConnections();
    server.close();
    await database.cleanup();
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
  await database.cleanup();
  console.error(
    'Browser-test server setup failed. Check Atlas access and test database permissions.',
  );
  process.exitCode = 1;
}
