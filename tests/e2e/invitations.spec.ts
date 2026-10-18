import { test, expect } from '@playwright/test';
test('team prepares, shares, marks Sent, replaces and archives a personal family invitation', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto('/signup');
  await page.getByLabel('Your name', { exact: true }).fill('Invitation Admin');
  await page
    .getByLabel('Email address', { exact: true })
    .fill(`family-browser-${Date.now()}@example.test`);
  const password = 'a synthetic invitation passphrase';
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel("First partner's name").fill('Test A');
  await page.getByLabel("Second partner's name").fill('Test B');
  await page.getByLabel('Main wedding date').fill('2026-12-31');
  await page.getByRole('button', { name: 'Create wedding workspace' }).click();
  await page.getByRole('link', { name: 'Manage ceremonies' }).click();
  for (const name of ['Mehendi', 'Sangeet']) {
    await page
      .getByRole('button', { name: 'Add ceremony', exact: true })
      .click();
    await page.getByLabel('Ceremony name').fill(name);
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
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('link', { name: 'Invitations', exact: true }).click();
  await page.getByRole('button', { name: 'Add family', exact: true }).click();
  await page.getByLabel('Family display name').fill('Test Family');
  await page
    .getByLabel('Contact name', { exact: true })
    .fill('Private test contact');
  await page.getByLabel('Contact phone (optional)').fill('+919000000001');
  await page.getByRole('checkbox', { name: 'Mehendi', exact: true }).check();
  await page.getByRole('button', { name: 'Save family', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Test Family', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Share invitation', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Publish your wedding');
  await page
    .getByRole('link', { name: 'Preview and publish your website' })
    .click();
  await page
    .getByRole('button', { name: 'Publish website', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Website published' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Invitations', exact: true }).click();
  await page
    .getByRole('button', { name: 'Share invitation', exact: true })
    .click();
  const link = await page
    .getByLabel('Invitation link', { exact: true })
    .inputValue();
  expect(link).toMatch(/\/invite\/[a-f0-9]{64}$/);
  const shared = page.getByRole('region', { name: 'Share invitation' });
  await expect(shared).toContainText('does not mark Sent');
  expect(
    await shared
      .getByRole('textbox', { name: 'Message', exact: true })
      .inputValue(),
  ).toContain('Mehendi');
  await page.screenshot({
    path: 'test-results/invitations-desktop.png',
    fullPage: true,
  });
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await context.newPage();
  try {
    await guest.goto(link);
    await expect(
      guest.getByRole('heading', { name: 'Dear Test Family,' }),
    ).toBeVisible();
    await expect(guest).toHaveURL(/\/invite$/);
    const personalSection = guest.getByRole('region', {
      name: 'Personal invitation',
    });
    await expect(personalSection).toContainText('Test garden');
    await expect(
      personalSection.getByRole('link', { name: 'Call Test organiser' }),
    ).toBeVisible();
    await expect(
      guest.getByRole('heading', { name: 'Full wedding schedule' }),
    ).toBeVisible();
    await expect(
      guest
        .locator('#schedule')
        .getByRole('heading', { name: 'Mehendi', exact: true }),
    ).toBeVisible();
    await expect(
      guest
        .locator('#schedule')
        .getByRole('heading', { name: 'Sangeet', exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByText("You're invited", { exact: true }),
    ).toHaveCount(1);
    await expect(
      guest.getByText('Private test contact', { exact: true }),
    ).toHaveCount(0);
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: 'test-results/invitation-guest-mobile.png',
      fullPage: true,
    });
    await guest.reload();
    await expect(guest.getByRole('alert')).toContainText(
      'Reopen the original invitation link',
    );
    await guest.goto(link);
    await expect(
      guest.getByRole('heading', { name: 'Dear Test Family,' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mark Sent', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sent status updated');
    const estimates = await page.request.get('/api/v1/attendance-estimates');
    expect((await estimates.json()).data).toMatchObject({
      sentFamilies: 1,
      attendees: { min: 2, max: 3 },
    });
    await page
      .getByRole('button', { name: 'Share invitation', exact: true })
      .click();
    expect(
      await page.getByLabel('Invitation link', { exact: true }).inputValue(),
    ).toBe(link);
    await page
      .getByRole('button', { name: 'Replace link', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm replacement', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Invitation link replaced',
    );
    await guest.goto(link);
    await expect(guest.getByRole('alert')).toContainText(
      'may have been replaced',
    );
    await expect(
      guest.getByRole('heading', { name: 'Dear Test Family,' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Share invitation', exact: true })
      .click();
    const fresh = await page
      .getByLabel('Invitation link', { exact: true })
      .inputValue();
    expect(fresh).not.toBe(link);
    await guest.goto(fresh);
    await expect(
      guest.getByRole('heading', { name: 'Dear Test Family,' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Close sharing', exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/invitations-team-mobile.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Archive family', exact: true })
      .click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Test Family', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Archive family', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm archive', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Family archived');
    await guest.goto(fresh);
    await expect(guest.getByRole('alert')).toContainText(
      'may have been replaced',
    );
    expect(
      (await (await page.request.get('/api/v1/attendance-estimates')).json())
        .data.sentFamilies,
    ).toBe(0);
  } finally {
    await context.close();
  }
});
