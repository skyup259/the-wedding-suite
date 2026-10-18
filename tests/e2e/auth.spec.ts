import { test, expect } from '@playwright/test';

test('signup, refresh, logout, private denial, and login on desktop/mobile', async ({
  page,
}) => {
  const email = `browser-${Date.now()}@example.test`,
    password = 'a synthetic browser passphrase';
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Create a workspace' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Test organiser');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Tell us about your wedding.' }),
  ).toBeFocused();
  await page.screenshot({
    path: 'test-results/auth-signup-desktop.png',
    fullPage: true,
  });
  await page
    .getByLabel("First partner's name", { exact: true })
    .fill('Test Avani');
  await page
    .getByLabel("Second partner's name", { exact: true })
    .fill('Test Swar');
  await page
    .getByLabel('Main wedding date', { exact: true })
    .fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Test organiser.' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Test organiser.' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/auth-dashboard.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Email or password is incorrect.',
  );
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Test organiser.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/auth-dashboard-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({
    path: 'test-results/auth-login-mobile.png',
    fullPage: true,
  });
});
