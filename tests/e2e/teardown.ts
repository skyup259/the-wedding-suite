import { rm } from 'node:fs/promises';
import { e2eOutbox } from '../../server/test/helpers/e2e-outbox.js';
import type { FullConfig } from '@playwright/test';
import { createTestDatabase } from '../../server/test/helpers/test-database.js';

// Await cleanup in Playwright itself: npm/process-group shutdown can interrupt
// the HTTP child's asynchronous signal handler before its drop completes.
export default async function teardown(config: FullConfig) {
  const name: unknown = config.metadata.databaseName;
  if (typeof name !== 'string')
    throw new Error('Missing browser-test database name.');
  try {
    if (!config.metadata.memory) {
      const database = await createTestDatabase(name);
      await database.cleanup();
      console.log('Isolated browser-test database removed.');
    }
  } finally {
    await rm(e2eOutbox(name), { recursive: true, force: true });
  }
}
