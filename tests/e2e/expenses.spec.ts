import { test, expect } from '@playwright/test';
test('team records expenses, split payments, filters and archives with exact balances', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Expense Admin');
  await page
    .getByLabel('Email address', { exact: true })
    .fill(`expense-browser-${Date.now()}@example.test`);
  const password = 'a synthetic expense browser passphrase';
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel("First partner's name").fill('Test A');
  await page.getByLabel("Second partner's name").fill('Test B');
  await page.getByLabel('Main wedding date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await page
    .getByRole('link', { name: 'Manage expenses', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Expenses & payments' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill('Photography');
  await page.getByLabel('Category', { exact: true }).fill('Photography');
  await page.getByLabel('Total cost (INR)').fill('80000');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Expense added.' }),
  ).toBeVisible();
  async function pay(name: string, amount: string, retry = false) {
    await page
      .getByRole('button', { name: 'Add payment', exact: true })
      .click();
    await page.getByLabel('Payment amount (INR)').fill(amount);
    await page.getByLabel('Paid by', { exact: true }).fill(name);
    await page.getByLabel('Payment date', { exact: true }).fill('2026-10-22');
    await page
      .getByRole('button', { name: 'Save payment', exact: true })
      .click();
    if (retry) {
      await expect(page.getByLabel('Payment amount (INR)')).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Close expense', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Add expense', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Save expense', exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('button', { name: 'Retry original payment', exact: true })
        .click();
    }
    await expect(
      page.getByRole('form', { name: 'Add payment', exact: true }),
    ).toHaveCount(0);
  }
  // Lose the response after the server commits; the retry must reuse the original operation.
  await page.route(
    '**/api/v1/expenses/*/payments',
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    },
    { times: 1 },
  );
  await pay('Test payer A', '20000', true);
  await pay('Test payer B', '30000');
  const totals = page.getByRole('region', { name: 'Expense totals' });
  await expect(totals).toContainText('₹50,000.00');
  await expect(totals).toContainText('₹30,000.00');
  await page
    .getByRole('button', { name: 'Edit payment by Test payer A', exact: true })
    .click();
  await page.getByLabel('Payment amount (INR)').fill('60000');
  await page.getByRole('button', { name: 'Save payment', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Payment updated.' }),
  ).toBeVisible();
  await expect(totals).toContainText('₹10,000.00');
  await page
    .getByRole('button', {
      name: 'Remove payment by Test payer A',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Confirm payment removal', exact: true })
    .click();
  await expect(totals).toContainText('₹30,000.00');
  await expect(totals).toContainText('₹50,000.00');
  await page
    .getByRole('button', { name: 'Close expense', exact: true })
    .click();
  await page.getByLabel('Payer filter', { exact: true }).fill('Test payer B');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Payment report' }),
  ).toContainText('Matching payments: ₹30,000.00');
  await page.screenshot({
    path: 'test-results/expenses-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: 'Manage Photography', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Manage expense' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/expenses-mobile.png',
    fullPage: true,
  });
  // A second editor wins. A stale save retains text until the user explicitly reloads.
  const expense = (await (await page.request.get('/api/v1/expenses')).json())
    .data[0];
  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()).data
    .csrfToken;
  const changed = await page.request.patch(`/api/v1/expenses/${expense.id}`, {
    headers: {
      Origin: 'http://127.0.0.1:3101',
      'X-CSRF-Token': csrf,
      'If-Match': `"${expense.revision}"`,
    },
    data: { notes: 'Concurrent edit' },
  });
  expect(changed.status()).toBe(200);
  await page.getByLabel('Expense notes (optional)').fill('Unsaved local notes');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This expense changed');
  await expect(page.getByLabel('Expense notes (optional)')).toHaveValue(
    'Unsaved local notes',
  );
  await page
    .getByRole('button', {
      name: 'Reload latest expense (discard edits)',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Expense notes (optional)')).toHaveValue(
    'Concurrent edit',
  );
  await page
    .getByRole('button', { name: 'Archive expense', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cancel removal', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Archive expense', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm archive', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Expense archived.' }),
  ).toBeVisible();
  await expect(totals).toContainText('₹0.00');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Expenses & payments' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Manage Photography', exact: true }),
  ).toHaveCount(0);
});
