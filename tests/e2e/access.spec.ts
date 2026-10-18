import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { e2eOutbox } from '../../server/test/helpers/e2e-outbox.js';
async function openLink(page: Page, path: string, token: string) {
  await page.goto(path);
  // Keep synthetic capability values out of navigation diagnostics and traces.
  await page.evaluate(
    ({ path, token }) => {
      history.replaceState(history.state, '', `${path}#token=${token}`);
    },
    { path, token },
  );
  await page.reload();
}
async function emailToken(directory: string, to: string, subject: string) {
  let token: string | null = null;
  await expect
    .poll(
      async () => {
        const files = await readdir(directory).catch(() => []);
        for (const file of files) {
          const mail = JSON.parse(
            await readFile(join(directory, file), 'utf8'),
          ) as { to: string; subject: string; text: string };
          if (mail.to === to && mail.subject.includes(subject)) {
            token = /#token=([a-f0-9]{64})/.exec(mail.text)?.[1] ?? null;
          }
        }
        return Boolean(token);
      },
      { timeout: 15000 },
    )
    .toBe(true);
  return token!;
}
test('Admin invites Manager, Manager accepts, reset revokes sessions, and Admin disables access', async ({
  page,
  browser,
}, info) => {
  const suffix = Date.now(),
    adminEmail = `access-admin-${suffix}@example.test`,
    managerEmail = `access-manager-${suffix}@example.test`,
    password = 'a synthetic browser passphrase',
    outbox = e2eOutbox(String(info.config.metadata.databaseName));
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Test Admin');
  await page.getByLabel('Email address', { exact: true }).fill(adminEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel("First partner's name").fill('Test Avani');
  await page.getByLabel("Second partner's name").fill('Test Swar');
  await page.getByLabel('Main wedding date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await page.getByRole('link', { name: 'Manage wedding team' }).click();
  await page.getByLabel('Manager email').fill(managerEmail);
  await page.getByLabel('Manager name (optional)').fill('Test Manager');
  await page
    .getByRole('button', { name: 'Send invitation', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Invitation queued' }),
  ).toBeVisible();
  await expect(page.getByText(/Saved to local outbox/)).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({
    path: 'test-results/team-desktop.png',
    fullPage: true,
  });
  const managerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    manager = await managerContext.newPage();
  try {
    const token = await emailToken(outbox, managerEmail, 'Join');
    await openLink(manager, '/accept-invitation', token);
    await expect(manager.getByLabel('Your name')).toBeVisible();
    expect(new URL(manager.url()).hash === '').toBe(true);
    await manager.getByLabel('Your name').fill('Test Manager');
    await manager.getByLabel('New password', { exact: true }).fill(password);
    await manager
      .getByLabel('Confirm password', { exact: true })
      .fill(password);
    await manager.screenshot({
      path: 'test-results/manager-accept-mobile.png',
      fullPage: true,
    });
    await manager.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(
      manager.getByRole('heading', { name: 'Welcome, Test Manager.' }),
    ).toBeVisible();
    await manager.getByRole('link', { name: 'View wedding team' }).click();
    await expect(
      manager.getByRole('heading', { name: 'Team members' }),
    ).toBeVisible();
    await expect(
      manager.getByRole('button', { name: 'Send invitation', exact: true }),
    ).toHaveCount(0);
    await expect(manager.getByText(adminEmail, { exact: true })).toHaveCount(0);
    expect(
      await manager.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await manager.screenshot({
      path: 'test-results/team-manager-mobile.png',
      fullPage: true,
    });
    await manager.goto('/forgot-password');
    await manager.getByLabel('Email address').fill(managerEmail);
    await manager
      .getByRole('button', { name: 'Send reset instructions' })
      .click();
    await expect(manager.getByRole('status')).toContainText(
      'If an active account matches',
    );
    const reset = await emailToken(outbox, managerEmail, 'Reset');
    await openLink(manager, '/reset-password', reset);
    const next = 'a new synthetic browser passphrase';
    await manager.getByLabel('New password', { exact: true }).fill(next);
    await manager.getByLabel('Confirm password', { exact: true }).fill(next);
    await manager
      .getByRole('button', { name: 'Reset password', exact: true })
      .click();
    await expect(manager.getByRole('status')).toContainText('Password updated');
    await manager.screenshot({
      path: 'test-results/reset-success-mobile.png',
      fullPage: true,
    });
    await manager.getByRole('link', { name: 'Sign in', exact: true }).click();
    await manager.getByLabel('Email address').fill(managerEmail);
    await manager.getByLabel('Password', { exact: true }).fill(next);
    await manager.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      manager.getByRole('heading', { name: 'Welcome, Test Manager.' }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Manager disabled' }),
    ).toBeVisible();
    await manager.reload();
    await expect(manager).toHaveURL(/\/login$/);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/team-admin-mobile.png',
      fullPage: true,
    });
  } finally {
    await managerContext.close();
  }
});
