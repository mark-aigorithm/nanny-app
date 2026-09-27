/**
 * B3 — a catalogue edited in the console, seen from the app.
 *
 * Ten pages in the console are variations on one idea: an admin curates a list,
 * and the mobile app reads it. Testing all ten would be ten copies of the same
 * spec, so this one covers the *pattern* — create through the real form, then
 * read the surface the app actually reads — across the four catalogues that
 * have a genuine downstream consumer. The rest are static config with no second
 * reader.
 *
 * The read-back is always the **public** route, never the admin one. An admin
 * list would only confirm the row was written; what matters is that it crossed
 * into what a nanny picks from or a mother is charged, and those routes filter
 * on the way out. That filter is the thing worth asserting, which is why each
 * catalogue also creates something inactive and checks it stays invisible.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  getAppBookingOptions,
  listAppCertifications,
  listAppPackages,
  listAppSkills,
  seedMother,
  superuserToken,
  validateAppPromo,
} from './helpers/backend';
import { gotoConsole } from './helpers/locators';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(60_000);
});

/** Unique per call, so a name can be looked for in a database nothing truncates. */
let sequence = 0;
function uniqueName(prefix: string): string {
  sequence += 1;
  return `E2E ${prefix} ${Date.now().toString(36)}${sequence}`;
}

/**
 * The booking-length ceiling on the Booking Options page.
 *
 * Not reachable as "Maximum": that page has two of them — the longest bookable
 * shift and the most children per booking — told apart only by the unit their
 * label carries.
 */
function maxHours(page: Page) {
  return page.getByRole('spinbutton', { name: 'Maximum hours', exact: true });
}

test('a new skill reaches the catalogue a nanny picks from', async ({ page }) => {
  const admin = await superuserToken();
  const live = uniqueName('skill');
  const hidden = uniqueName('skill-inactive');

  await gotoConsole(page, '/skills');

  // "Add skill" opens the page's one form dialog; its submit shares the header
  // button's label, so everything after the click is scoped to the dialog.
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Add skill' }).click();
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(live);
  await dialog.getByRole('textbox', { name: /^Description/ }).fill('Created by the E2E suite.');
  await dialog.getByRole('button', { name: 'Add skill' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr').filter({ hasText: live })).toBeVisible();

  // The same dialog again, this time switched off before saving.
  await page.getByRole('button', { name: 'Add skill' }).click();
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(hidden);
  await dialog.locator('.field', { hasText: 'Status' }).getByRole('button').click();
  await page.getByRole('option', { name: 'Inactive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add skill' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr').filter({ hasText: hidden })).toBeVisible();

  const names = (await listAppSkills(admin)).map((skill) => skill.name);
  expect(names).toContain(live);
  // Both rows exist in the console; only one is offered to a nanny.
  expect(names).not.toContain(hidden);
});

test('a new certification reaches the nanny picker', async ({ page }) => {
  const admin = await superuserToken();
  const name = uniqueName('cert');

  await gotoConsole(page, '/certifications');

  // Add opens the page's one form dialog; its submit shares the header button's label,
  // so everything after the click is scoped to the dialog.
  await page.getByRole('button', { name: 'Add certification' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
  await dialog.getByRole('button', { name: 'Add certification' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible();

  expect((await listAppCertifications(admin)).map((c) => c.name)).toContain(name);
});

test('a new package is offered to a mother', async ({ page }) => {
  const admin = await superuserToken();
  const name = uniqueName('package');

  await gotoConsole(page, '/packages');

  // Add opens the page's one form dialog; its submit shares the header button's label,
  // so everything after the click is scoped to the dialog.
  await page.getByRole('button', { name: 'Add package' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
  await dialog.getByRole('spinbutton', { name: /^Hours/ }).fill('10');
  await dialog.getByRole('spinbutton', { name: /^Price \(EGP\)/ }).fill('900');
  await dialog.getByRole('button', { name: 'Add package' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible();

  expect((await listAppPackages(admin)).map((p) => p.name)).toContain(name);
});

test('a new promo code discounts a real checkout', async ({ page }) => {
  const mother = await seedMother();
  const code = `E2E${Date.now().toString(36).toUpperCase()}`;

  await gotoConsole(page, '/promo-codes');

  // Add opens the page's one form dialog; its submit shares the header button's label,
  // so everything after the click is scoped to the dialog.
  await page.getByRole('button', { name: 'Add promo code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Code/ }).fill(code);
  await dialog.getByRole('spinbutton', { name: /^Discount %/ }).fill('10');
  await dialog.getByRole('button', { name: 'Add promo code' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody tr').filter({ hasText: code })).toBeVisible();

  // Not "the row exists" — the money actually taken off a mother's subtotal.
  // The endpoint returns only the discount; the app subtracts it itself.
  const applied = await validateAppPromo(mother.token, code, 1000);
  expect(applied.discountAmount).toBe(100);

  // And a code nobody created is refused, so the assertion above is about this
  // code rather than about the endpoint saying yes to anything.
  await expect(validateAppPromo(mother.token, `${code}X`, 1000)).rejects.toThrow(/400|404/);
});

test('a booking rule changed in the console reaches the app', async ({ page }) => {
  const admin = await superuserToken();
  const before = await getAppBookingOptions(admin);
  const changed = before.maxBookingHours === 13 ? 12 : 13;

  await gotoConsole(page, '/settings');

  try {
    // `maxBookingHours` on purpose: it is the one field in this payload that no
    // other spec's fixtures depend on. Raising the ceiling cannot invalidate a
    // booking any of them makes.
    await maxHours(page).fill(String(changed));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();

    expect((await getAppBookingOptions(admin)).maxBookingHours).toBe(changed);
  } finally {
    // Restored through the console, not the database: this config is global and
    // nothing truncates it between specs, so leaving it changed would quietly
    // alter every booking made after this test for the rest of the run.
    await maxHours(page).fill(String(before.maxBookingHours));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect
      .poll(async () => (await getAppBookingOptions(admin)).maxBookingHours)
      .toBe(before.maxBookingHours);
  }
});
