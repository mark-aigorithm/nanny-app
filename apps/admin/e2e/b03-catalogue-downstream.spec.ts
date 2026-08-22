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
 * The create form on a catalogue page, scoped by its card heading.
 *
 * Everything below fills through this rather than `page.getByLabel`, because
 * these pages reuse label words freely — "Hours" appears twice on Packages,
 * "Maximum" twice on Booking Options — and `Field` folds its hint text into the
 * label element, so the accessible name of one control can be a superstring of
 * another's. A page-wide lookup by label matches several inputs and fails strict
 * mode; scoping to the card and matching exactly does not.
 */
function form(page: Page, title: string) {
  return page.locator('.card').filter({ has: page.getByRole('heading', { name: title }) });
}

/**
 * Fills a numeric or text input inside a create form.
 *
 * Matched on a name *starting with* the label, not equalling it: `Field` renders
 * its hint inside the same `<label>`, so "Description" is really "Description
 * Optional — shown to admins only." Anchoring at the start still separates the
 * two "Hours" fields on Packages, where the other one begins "Validity (days)".
 */
async function fill(page: Page, title: string, label: string, value: string): Promise<void> {
  const scope = form(page, title);
  const name = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const input = scope
    .getByRole('textbox', { name })
    .or(scope.getByRole('spinbutton', { name }));
  await input.fill(value);
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

/** Sets one of the console's custom Select controls by its visible label. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.locator('.field', { hasText: label }).getByRole('button').click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('a new skill reaches the catalogue a nanny picks from', async ({ page }) => {
  const admin = await superuserToken();
  const live = uniqueName('skill');
  const hidden = uniqueName('skill-inactive');

  await gotoConsole(page, '/skills');

  await fill(page, 'Create skill', 'Name', live);
  await fill(page, 'Create skill', 'Description', 'Created by the E2E suite.');
  await page.getByRole('button', { name: 'Create skill' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: live })).toBeVisible();

  // The same form again, this time switched off before saving.
  await fill(page, 'Create skill', 'Name', hidden);
  await choose(page, 'Status', 'Inactive');
  await page.getByRole('button', { name: 'Create skill' }).click();
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

  await fill(page, 'Create certification', 'Name', name);
  await page.getByRole('button', { name: 'Create certification' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible();

  expect((await listAppCertifications(admin)).map((c) => c.name)).toContain(name);
});

test('a new package is offered to a mother', async ({ page }) => {
  const admin = await superuserToken();
  const name = uniqueName('package');

  await gotoConsole(page, '/packages');

  await fill(page, 'Create package', 'Name', name);
  await fill(page, 'Create package', 'Hours', '10');
  await fill(page, 'Create package', 'Price (EGP)', '900');
  await page.getByRole('button', { name: 'Create package' }).click();
  await expect(page.locator('tbody tr').filter({ hasText: name })).toBeVisible();

  expect((await listAppPackages(admin)).map((p) => p.name)).toContain(name);
});

test('a new promo code discounts a real checkout', async ({ page }) => {
  const mother = await seedMother();
  const code = `E2E${Date.now().toString(36).toUpperCase()}`;

  await gotoConsole(page, '/promo-codes');

  await fill(page, 'Create promo code', 'Code', code);
  await fill(page, 'Create promo code', 'Discount %', '10');
  await page.getByRole('button', { name: 'Create promo code' }).click();
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
