/**
 * Signing in during a spec, rather than adopting a saved role.
 *
 * Most specs take a role from `storageState` and never see the login form —
 * that is `global-setup.ts`'s job, and it is the right default. But a privilege
 * change only takes effect on the account's *next* session, so a spec that
 * changes one has to open a second, signed-out browser and log in for real.
 * That is what this file is for; it is deliberately not a shortcut around
 * storage state.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * A page in its own context, carrying no cookies, no IndexedDB and therefore no
 * Firebase session.
 *
 * The empty `storageState` is the whole point and must not be dropped: the
 * `browser` fixture applies the spec's own `test.use({ storageState })` to
 * anything it opens, so a plain `newContext()` comes back **already signed in
 * as that role**. The failure is quiet and misleading — `/login` redirects
 * instantly to the dashboard, and the spec times out hunting for a password
 * field on a page that has none.
 *
 * `baseURL` is passed for the opposite reason: it is a test option rather than
 * a context default, so it does *not* come along, and relative paths throw
 * without it.
 */
export async function newSignedOutPage(browser: Browser): Promise<Page> {
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error('No baseURL configured — check playwright.config.ts.');

  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  return context.newPage();
}

/**
 * Waits until the console has actually settled on the login form.
 *
 * The mirror image of `gotoConsole`, and slow for the mirror-image reason:
 * `RequireAuth` renders nothing at all until Firebase has finished deciding
 * there is *no* session, so on WebKit the form can be seconds late. Asserting
 * the URL instead would be worse — it is `/login` long before anything is
 * usable.
 */
export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Signs in through the real form and waits for the redirect away from /login.
 *
 * Waiting on the URL rather than on a dashboard element keeps this usable for
 * any role: an operator without the dashboard section lands on their first
 * granted section instead, and asserting on a heading would couple the helper
 * to whichever page that happens to be.
 */
export async function signInToConsole(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** Attempts a sign-in that is expected to fail, and asserts it did. */
export async function expectSignInRefused(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The console is never reached, and the form says so rather than hanging.
  await expect(page.getByText(/Sign-in failed|Invalid email or password/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}
