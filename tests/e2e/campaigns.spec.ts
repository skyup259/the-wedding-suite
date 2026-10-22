import { test, expect } from '@playwright/test';
test('team reviews and confirms an individually addressed outbox email batch without inflating Sent estimates', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Email Admin');
  await page
    .getByLabel('Email address', { exact: true })
    .fill(`batch-browser-${Date.now()}@example.test`);
  const password = 'a synthetic email batch passphrase';
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel("First partner's name").fill('Test A');
  await page.getByLabel("Second partner's name").fill('Test B');
  await page.getByLabel('Main wedding date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await page.getByRole('link', { name: 'Manage ceremonies' }).click();
  await page.getByRole('button', { name: 'Add ceremony', exact: true }).click();
  await page.getByLabel('Ceremony name').fill('Test Mehendi');
  await page
    .getByLabel('Start date and time', { exact: true })
    .fill('2026-12-30T15:30');
  await page.getByLabel('Venue name').fill('Test garden');
  await page.getByLabel('Venue address').fill('Synthetic venue');
  await page.getByLabel('First contact name').fill('Test organiser');
  await page.getByLabel('First contact phone').fill('+919000000000');
  await page
    .getByRole('button', { name: 'Save ceremony', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Test Mehendi', exact: true }),
  ).toBeVisible();
  await page.goto('/website/preview');
  await page
    .getByRole('button', { name: 'Publish website', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Website published' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Invitations', exact: true }).click();
  await page.getByRole('button', { name: 'Add family', exact: true }).click();
  await page.getByLabel('Family display name').fill('Synthetic Email Family');
  await page
    .getByLabel('Contact name', { exact: true })
    .fill('Private contact');
  await page
    .getByLabel('Contact email (optional)')
    .fill('synthetic-family@example.test');
  await page
    .getByRole('checkbox', { name: 'Test Mehendi', exact: true })
    .check();
  await page.getByRole('button', { name: 'Save family', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Synthetic Email Family', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Prepare family email batch' }).click();
  await page.getByRole('checkbox', { name: /Synthetic Email Family/ }).check();
  await page.getByRole('button', { name: 'Preview email batch' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review before sending' }),
  ).toBeVisible();
  await expect(
    page.getByText('To: synthetic-family@example.test', { exact: true }),
  ).toBeVisible();
  const review = page.getByRole('region', { name: 'Email batch review' });
  await expect(review).toContainText('Private local outbox');
  await expect(review).toContainText('Test Mehendi');
  await page.screenshot({
    path: 'test-results/email-batch-preview-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Confirm 1 outbox messages', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('No real email is sent');
  await expect(
    page.getByText('Local message only. Sent status was not changed.', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  const estimate = await page.request.get('/api/v1/attendance-estimates');
  expect((await estimate.json()).data.sentFamilies).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/email-batch-results-mobile.png',
    fullPage: true,
  });
  await expect(
    page.getByRole('checkbox', { name: /Synthetic Email Family/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole('button', { name: /1 families · confirmed · outbox/ }),
  ).toBeVisible();
});
