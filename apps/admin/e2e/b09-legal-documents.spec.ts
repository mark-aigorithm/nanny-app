/**
 * B9 — the Terms of Service an operator writes on Settings are the terms the
 * registration wizard opens.
 *
 * Driven through the console's editor, read back through the public
 * `/legal/terms` as the signed-out app would. The documents are global, so a
 * test puts back what it found (a placeholder can't be un-saved, so one that
 * started as the placeholder stays saved; the test DB is reset between runs).
 */
import { expect, test, type Page } from '@playwright/test';

import { getAppLegalDocument, setLegalDocumentAsAdmin, superuserToken } from './helpers/backend';
import { gotoConsole } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

function termsForm(page: Page) {
  return page.getByRole('form', { name: 'Terms of Service' });
}

test('terms saved in the console reach the app, signed out', async ({ page }) => {
  const admin = await superuserToken();
  const before = await getAppLegalDocument('terms');
  const body = `Book and pay through the app. ${Date.now().toString(36)}`;

  await gotoConsole(page, '/settings');
  const form = termsForm(page);
  await expect(form.getByLabel('Terms of Service — text')).toHaveValue(before.body);

  try {
    await form.getByLabel('Terms of Service — text').fill(body);
    await form.getByRole('button', { name: 'Save Terms of Service' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Terms of Service saved' })).toBeVisible();
    await expect(form.getByText(/last saved/i)).toBeVisible();

    const shown = await getAppLegalDocument('terms');
    expect(shown.body).toBe(body);
    expect(shown.updatedAt).not.toBeNull();

    await page.reload();
    await expect(termsForm(page).getByLabel('Terms of Service — text')).toHaveValue(body);
  } finally {
    if (before.updatedAt !== null) {
      await setLegalDocumentAsAdmin(admin, 'terms', { title: before.title, body: before.body });
    }
  }
});

test('an empty text is refused before anything is sent', async ({ page }) => {
  const before = await getAppLegalDocument('privacy');

  await gotoConsole(page, '/settings');
  const form = page.getByRole('form', { name: 'Privacy Policy' });
  await form.getByLabel('Privacy Policy — text').fill('');
  await form.getByRole('button', { name: 'Save Privacy Policy' }).click();

  await expect(form.getByText(/needs some text/i)).toBeVisible();
  expect(await getAppLegalDocument('privacy')).toEqual(before);
});
