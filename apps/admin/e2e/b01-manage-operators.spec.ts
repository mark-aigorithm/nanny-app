/**
 * B1 — the superuser decides who else can sign in, and how far they reach.
 *
 * The permission *rules* are settled elsewhere: the backend suite walks
 * `ADMIN_ROUTE_PERMISSIONS` over HTTP, and A12 proves the console honours a
 * grant it was given. What is only provable here is the hand-off between the
 * two — that editing the matrix on this page changes what a different person,
 * in a different browser, is able to open.
 *
 * So every assertion below is made in a **second, signed-out session**. A grant
 * is read once per session, into `PermissionsProvider`, from a single
 * `/admin/me` call; a spec that only re-read the superuser's own page would
 * pass while every operator kept their stale reach until they cleared cookies.
 */
import { expect, test, type Page } from '@playwright/test';

import { uniqueConsoleAccount, type ConsoleAccount } from './helpers/backend';
import { gotoConsole, rowFor } from './helpers/locators';
import { expectSignInRefused, newSignedOutPage, signInToConsole } from './helpers/session';
import { storageStatePath } from './roles';

test.use({ storageState: storageStatePath('superuser') });

/**
 * Every test here fills the create form, then boots one or two *more* console
 * sessions from cold — each of which waits on Firebase restoring a session and
 * then on `/admin/me`. That does not fit in the 30s default, and the failure it
 * produces ("locator.fill: Test ended") points at the login form rather than at
 * the budget, which is worth not making the next person diagnose.
 */
test.beforeEach(({}, testInfo) => {
  testInfo.setTimeout(90_000);
});

/**
 * One specific toast, rather than "any live region".
 *
 * Every test here fires at least two: one for creating the account and one for
 * the action being tested. They overlap on screen, so a bare
 * `getByRole('status')` matches both and fails strict mode — intermittently,
 * since whether the first has faded depends on how fast the run is.
 */
function toast(page: Page, text: string) {
  return page.getByRole('status').filter({ hasText: text });
}

function nav(page: Page, label: string) {
  return page.getByRole('navigation').getByRole('link', { name: label, exact: true });
}

/**
 * Sets one section's level in the permission matrix.
 *
 * Clicks the `<label>`, not the radio: the input is laid out underneath its own
 * label, so `check()` spends thirty seconds being told the label "intercepts
 * pointer events". Clicking the label is also what a person does — and the
 * `toBeChecked` that follows is what proves the click reached the input rather
 * than landing on decoration.
 */
async function grant(page: Page, section: string, level: 'No access' | 'View' | 'Manage') {
  const group = page.getByRole('radiogroup', { name: `Access to ${section}` });

  await group.locator('label').filter({ hasText: new RegExp(`^${level}$`) }).click();
  await expect(group.getByRole('radio', { name: level })).toBeChecked();
}

/**
 * Creates an operator through the Team page and returns their credentials.
 *
 * Driven rather than seeded on purpose: `createAdminUser` provisions the
 * Firebase account as a side effect of the console call, so an operator seeded
 * over HTTP would not prove that a superuser can actually produce a working
 * login from this form.
 */
async function createOperator(
  page: Page,
  sections: Record<string, 'View' | 'Manage'>,
): Promise<ConsoleAccount> {
  const account = uniqueConsoleAccount();

  await gotoConsole(page, '/admins');
  await page.getByRole('button', { name: 'Add team member' }).click();

  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);

  // Operator is the default role, so the matrix is already showing.
  for (const [section, level] of Object.entries(sections)) {
    await grant(page, section, level);
  }

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(toast(page, 'Account created')).toBeVisible();

  return account;
}

test('a created operator can sign in, and reaches only what was granted', async ({
  page,
  browser,
}) => {
  const account = await createOperator(page, { Bookings: 'Manage' });

  // The table summarises the grant rather than repeating the matrix.
  await expect(rowFor(page, account.surname)).toContainText('1 manage');
  await expect(rowFor(page, account.surname)).toContainText('operator');

  const theirs = await newSignedOutPage(browser);
  await signInToConsole(theirs, account.email, account.password);
  await gotoConsole(theirs, '/bookings');

  await expect(nav(theirs, 'Bookings')).toBeVisible();
  await expect(nav(theirs, 'Users')).toHaveCount(0);
  // Team is the superuser's own page and is never granted by the matrix.
  await expect(nav(theirs, 'Team')).toHaveCount(0);
});

test('widening a grant reaches the operator on their next sign-in', async ({ page, browser }) => {
  const account = await createOperator(page, { Bookings: 'Manage' });

  // Their reach before the change, established in a session of its own so the
  // "after" assertion cannot be satisfied by a grant that was always there.
  const before = await newSignedOutPage(browser);
  await signInToConsole(before, account.email, account.password);
  await gotoConsole(before, '/bookings');
  await expect(nav(before, 'Users')).toHaveCount(0);

  await rowFor(page, account.surname).getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Edit access' }).click();
  await grant(page, 'Users', 'View');
  await page.getByRole('button', { name: 'Save access' }).click();
  await expect(toast(page, 'Access updated')).toBeVisible();

  const after = await newSignedOutPage(browser);
  await signInToConsole(after, account.email, account.password);
  await gotoConsole(after, '/users');

  await expect(nav(after, 'Users')).toBeVisible();
  await expect(after.getByRole('heading', { name: 'Users' })).toBeVisible();
  // Granted at VIEW, so the section opens without the controls that write.
  await expect(after.getByRole('button', { name: /^Actions for/ })).toHaveCount(0);
});

test('narrowing a grant closes the section it removed', async ({ page, browser }) => {
  const account = await createOperator(page, { Bookings: 'Manage', Users: 'Manage' });

  await rowFor(page, account.surname).getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Edit access' }).click();
  await grant(page, 'Users', 'No access');
  await page.getByRole('button', { name: 'Save access' }).click();
  await expect(toast(page, 'Access updated')).toBeVisible();

  const theirs = await newSignedOutPage(browser);
  await signInToConsole(theirs, account.email, account.password);

  // Hiding the link is presentation; typing the URL is the part that enforces it.
  await gotoConsole(theirs, '/users');
  await expect(theirs).not.toHaveURL(/\/users/);
  await expect(nav(theirs, 'Users')).toHaveCount(0);
});

test('removing an operator ends their access at the door', async ({ page, browser }) => {
  const account = await createOperator(page, { Bookings: 'Manage' });

  // Prove the account works first, so the refusal below is attributable to the
  // removal rather than to a login that never worked.
  const before = await newSignedOutPage(browser);
  await signInToConsole(before, account.email, account.password);
  await expect(nav(before, 'Bookings')).toBeVisible();

  await rowFor(page, account.surname).getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(toast(page, 'Account removed')).toBeVisible();
  await expect(rowFor(page, account.surname)).toHaveCount(0);

  // Removal disables the Firebase account, so they are stopped by
  // authentication itself rather than by a section check further in.
  const after = await newSignedOutPage(browser);
  await expectSignInRefused(after, account.email, account.password);
});

test('the superuser cannot remove or re-scope itself here', async ({ page }) => {
  await gotoConsole(page, '/admins');

  // By email, not by "superuser": the word also appears in the role badge and in
  // other seeded console accounts, so the plainer match finds three rows.
  const own = rowFor(page, 'e2e-superuser@test.local');
  await expect(own).toBeVisible();
  await expect(own.getByRole('button', { name: /^Actions for/ })).toBeDisabled();
});
