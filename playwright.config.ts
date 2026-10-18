import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const databaseName = `ws_test_auth_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
export default defineConfig({
  metadata: { databaseName },
  globalTeardown: './tests/e2e/teardown.ts',
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
      },
    },
  ],
  webServer: {
    env: { AUTH_E2E_DATABASE_NAME: databaseName },
    command: 'npm run build && npm run e2e:serve -w @wedding-suite/server',
    url: 'http://127.0.0.1:3101/api/v1/health/ready',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
