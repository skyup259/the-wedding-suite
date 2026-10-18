import { test, expect } from '@playwright/test';
test('team edits ceremonies, previews three themes, publishes live updates and unpublishes', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  const email = `website-browser-${Date.now()}@example.test`,
    password = 'a synthetic website passphrase';
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Website Admin');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel("First partner's name").fill('Test Avani');
  await page.getByLabel("Second partner's name").fill('Test Swar');
  await page.getByLabel('Main wedding date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await page.getByRole('link', { name: 'Manage ceremonies' }).click();
  await page.getByRole('button', { name: 'Add ceremony', exact: true }).click();
  await page.getByLabel('Ceremony name').fill('Mehendi celebration');
  await page
    .getByLabel('Start date and time', { exact: true })
    .fill('2026-12-30T15:30');
  await page.getByLabel('Venue name').fill('Test garden');
  await page.getByLabel('Venue address').fill('Synthetic venue address');
  await page.getByLabel('First contact name').fill('Test organiser');
  await page.getByLabel('First contact phone').fill('+919000000000');
  await page.screenshot({
    path: 'test-results/website-events-editor-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Save ceremony', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mehendi celebration', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Website', exact: true }).click();
  await page
    .getByLabel('Introduction', { exact: true })
    .fill('Join us for a celebration full of love.');
  await page
    .getByLabel('Welcome message')
    .fill('We are so glad you will be part of our day.');
  await page.getByRole('button', { name: 'Save website', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Draft saved' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/website-settings-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Preview saved website' }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Avani & Test Swar', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/website-preview-desktop.png',
    fullPage: true,
  });
  // The safe preview response supplies the public address without exposing private fields.
  const preview = await page.request.get('/api/v1/wedding/preview');
  const model = (await preview.json()) as {
    data: { wedding: { slug: string } };
  };
  const address = '/w/' + model.data.wedding.slug;
  const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await guestContext.newPage();
  try {
    const privateResponse = await guest.request.get(
      '/api/v1/public/weddings/' + model.data.wedding.slug,
    );
    expect(privateResponse.status()).toBe(404);
    await page
      .getByRole('button', { name: 'Publish website', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Website published' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to website settings' }).click();
    await expect(page.getByText('Published', { exact: true })).toBeVisible();
    await page
      .getByLabel('Introduction', { exact: true })
      .fill('Published welcome.');
    await page
      .getByRole('button', { name: 'Save website', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Website saved' }),
    ).toBeVisible();
    // A genuinely stale editor still conflicts and retains its unsaved text.
    const otherEditor = await page.context().newPage();
    try {
      await otherEditor.goto('/website');
      await otherEditor
        .getByLabel('Introduction', { exact: true })
        .fill('Saved in another tab.');
      await otherEditor
        .getByRole('button', { name: 'Save website', exact: true })
        .click();
      await expect(
        otherEditor.getByRole('status').filter({ hasText: 'Website saved' }),
      ).toBeVisible();
      await page
        .getByLabel('Introduction', { exact: true })
        .fill('Keep my unsaved text.');
      await page
        .getByRole('button', { name: 'Save website', exact: true })
        .click();
      await expect(page.getByRole('alert')).toContainText('changed');
      await expect(
        page.getByLabel('Introduction', { exact: true }),
      ).toHaveValue('Keep my unsaved text.');
      await page
        .getByRole('button', {
          name: 'Reload saved version and discard local edits',
        })
        .click();
      await expect(
        page.getByLabel('Introduction', { exact: true }),
      ).toHaveValue('Saved in another tab.');
    } finally {
      await otherEditor.close();
    }
    await guest.goto(address);
    await expect(
      guest.getByRole('heading', {
        name: 'Test Avani & Test Swar',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      guest.getByRole('link', { name: 'Call Test organiser' }),
    ).toHaveAttribute('href', 'tel:+919000000000');
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: 'test-results/website-traditional-mobile.png',
      fullPage: true,
    });
    for (const theme of ['Floral', 'Minimal']) {
      await page.goto('/website');
      await page.getByRole('radio', { name: new RegExp(theme) }).check();
      await page
        .getByRole('button', { name: 'Save website', exact: true })
        .click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Website saved' }),
      ).toBeVisible();
      await guest.reload();
      await expect(guest.locator('[data-theme]').first()).toHaveAttribute(
        'data-theme',
        theme.toLowerCase(),
      );
      await expect(
        guest.locator('#schedule').getByRole('heading', {
          name: 'Mehendi celebration',
          exact: true,
        }),
      ).toBeVisible();
      await guest.screenshot({
        path: `test-results/website-${theme.toLowerCase()}-mobile.png`,
        fullPage: true,
      });
    }
    await page.goto('/events');
    await page
      .getByRole('button', { name: 'Edit Mehendi celebration', exact: true })
      .click();
    await page.getByLabel('Ceremony status').selectOption('in_progress');
    await page
      .getByRole('button', { name: 'Save ceremony', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Add ceremony', exact: true }),
    ).toBeVisible();
    // A focus/visibility return refreshes immediately; the periodic path remains 25s.
    await guest.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    );
    await expect(
      guest.locator('#today').getByText('In progress', { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.goto('/website');
    await page
      .getByLabel('Announcement for all guests')
      .fill('Please use the garden entrance.');
    await page
      .getByRole('button', { name: 'Save announcement', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Announcement saved' }),
    ).toBeVisible();
    await expect(
      guest.getByText('Please use the garden entrance.', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const html = await guest.request.get(address);
    const text = await html.text();
    expect(text.includes('property="og:title"')).toBe(true);
    expect(text.includes('Test Avani &amp; Test Swar')).toBe(true);
    await page.goto('/website');
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Website unpublished' }),
    ).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByRole('heading', {
        name: 'Wedding website not available',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      guest.getByRole('heading', {
        name: 'Test Avani & Test Swar',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (
        await guest.request.get(
          '/api/v1/public/weddings/' + model.data.wedding.slug,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await guestContext.close();
  }
});
