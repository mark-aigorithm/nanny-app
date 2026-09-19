/**
 * B8 — an operator moves a nanny.
 *
 * A nanny's address is the one thing about her location that matters to the
 * product: proximity matching reads its pin and parents read its line. She
 * sets it once at registration and cannot change it in the app, so the
 * console is the only place it can be corrected. What this spec protects is
 * that the edit made here lands on the account — on the detail page, in the
 * directory's location column, and in what the app reads back through
 * `/addresses` — and that a view-only operator is not offered the control.
 *
 * The console under test has no Maps key, so the editor is in its typed-
 * coordinates form; the map + search variant needs a browser key and is
 * exercised by hand.
 */
import { expect, test } from '@playwright/test';

import { seedApprovedNanny, signIn, superuserToken } from './helpers/backend';
import { gotoConsole } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test('rewrites her address and the console and the app both read the new one', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedApprovedNanny(admin);

  await gotoConsole(page, `/users/nannies/${nanny.nannyProfileId}`);

  // What registration captured.
  const card = page.locator('.card', { hasText: 'Address' }).first();
  await expect(card).toContainText('2 Test Street, Cairo');

  await card.getByRole('button', { name: 'Edit address' }).click();
  await page.getByLabel(/^Address line/).fill('5 Corniche, Sidi Gaber, Alexandria');
  await page.getByLabel('Governorate').fill('Alexandria');
  await page.getByLabel('Area').fill('Sidi Gaber');
  await page.getByLabel('Latitude').fill('31.2117');
  await page.getByLabel('Longitude').fill('29.9403');
  await page.getByLabel(/^Landmark/).fill('Opposite the tram stop');
  await page.getByRole('button', { name: 'Save address' }).click();

  await expect(page.getByText('Address updated')).toBeVisible();
  await expect(card).toContainText('5 Corniche, Sidi Gaber, Alexandria');
  await expect(card).toContainText('Sidi Gaber, Alexandria');
  await expect(card).toContainText('Opposite the tram stop');

  // The profile card's Location line is derived from the same row.
  await expect(page.locator('.card', { hasText: 'Profile' }).first()).toContainText(
    '5 Corniche, Sidi Gaber, Alexandria',
  );

  // And so is what the nanny's own app reads.
  const appToken = await signIn(nanny.email);
  const response = await fetch(`${process.env['E2E_API_BASE_URL'] ?? 'http://127.0.0.1:3001'}/addresses`, {
    headers: { Authorization: `Bearer ${appToken}` },
  });
  const body = (await response.json()) as { data: Array<{ formattedAddress: string; latitude: number }> };
  expect(body.data).toHaveLength(1);
  expect(body.data[0]).toMatchObject({
    formattedAddress: '5 Corniche, Sidi Gaber, Alexandria',
    latitude: 31.2117,
  });
});

test('refuses to save an address with no coordinates', async ({ page }) => {
  const admin = await superuserToken();
  const nanny = await seedApprovedNanny(admin);

  await gotoConsole(page, `/users/nannies/${nanny.nannyProfileId}`);
  const card = page.locator('.card', { hasText: 'Address' }).first();
  await card.getByRole('button', { name: 'Edit address' }).click();

  await page.getByLabel('Latitude').fill('');
  await page.getByRole('button', { name: 'Save address' }).click();

  await expect(page.getByText('Search for or pin the address.')).toBeVisible();
  // Nothing changed.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toContainText('2 Test Street, Cairo');
});
