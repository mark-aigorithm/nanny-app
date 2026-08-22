/**
 * B2 — getting in, staying in, and getting out.
 *
 * Everything here is invisible when it works and total when it does not: an
 * operator either reaches the console or stares at a login page. The four
 * behaviours are the deep-link bounce (`RequireAuth` remembers where you were
 * going), the request interceptor that attaches a Firebase token to every call,
 * the 401 safety net that refreshes and replays once, and sign-out.
 *
 * The 401 case is the reason this spec is worth having. `api-client.ts` retries
 * a rejected request exactly once, with a force-refreshed token — a path that
 * never runs in a healthy session and so is never otherwise exercised. It is
 * provoked here by failing a real response on its way back, which is the
 * closest thing to an expired token that does not involve waiting an hour.
 */
import { expect, test, type Page } from '@playwright/test';

import { seedPendingBooking } from './helpers/backend';
import { expectSignedOut, newSignedOutPage, signInToConsole } from './helpers/session';
import { gotoConsole } from './helpers/locators';
import { ROLES, storageStatePath } from './roles';

test.describe('signed out', () => {
  // No saved state: these must look like someone opening the console cold.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('remembers where you were going and returns you there', async ({ page }) => {
    // A link to a specific booking queue, of the kind pasted into a chat.
    await page.goto('/bookings');

    // Bounced, because there is no session yet.
    await expectSignedOut(page);

    await page.getByLabel('Email').fill(ROLES.superuser.email);
    await page.getByLabel('Password').fill(ROLES.superuser.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Back to the page that was asked for — not to the dashboard. This is the
    // `state.from` that RequireAuth attached on the way out.
    await expect(page).toHaveURL(/\/bookings/);
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  });

  test('sends a signed-in visitor on from the login page', async ({ page }) => {
    await signInToConsole(page, ROLES.superuser.email, ROLES.superuser.password);

    // Going back to /login with a live session must not strand them there.
    await page.goto('/login');
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe('signed in as superuser', () => {
  test.use({ storageState: storageStatePath('superuser') });

  test('attaches a bearer token to every backend call', async ({ page }) => {
    const authorised = page.waitForRequest(
      (request) =>
        request.url().includes('/admin/me') &&
        (request.headers()['authorization'] ?? '').startsWith('Bearer '),
    );

    await gotoConsole(page, '/');
    await authorised;
  });

  test('refreshes and replays a request the server rejects once', async ({ page }) => {
    // Seeded so the queue has a row to render: asserting that content appeared
    // would otherwise pass against an empty table for the wrong reason.
    await seedPendingBooking();

    // Reject the token the app is already holding, and accept any other. This
    // is what an expired token looks like from inside the app, and — unlike
    // "fail the first call" — it is a test only the interceptor can pass.
    //
    // Recovering is not on its own evidence of anything here. React Query is
    // configured `retry: 1`, and StrictMode mounts every effect twice in dev,
    // so a second identical request arrives within milliseconds no matter what
    // the interceptor does. Both of those reuse the cached token, because the
    // *request* interceptor calls `getIdToken()` unforced. Only the 401 handler
    // calls `getIdToken(true)`. So a request that gets through is proof of a
    // forced refresh, and nothing else in the app performs one.
    let staleToken = '';
    let refreshed = 0;

    await page.route('**/admin/bookings**', async (route) => {
      const authorization = route.request().headers()['authorization'] ?? '';
      if (!staleToken) staleToken = authorization;

      if (authorization === staleToken) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ data: null, error: 'Invalid or expired token' }),
        });
        return;
      }
      refreshed += 1;
      await route.continue();
    });

    await gotoConsole(page, '/bookings');

    // The recovery is silent: the operator sees the queue, not an error state.
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByText('Invalid or expired token')).toHaveCount(0);
    expect(refreshed).toBeGreaterThan(0);
  });

  test('gives up rather than looping when the refresh does not help', async ({ page }) => {
    // Every attempt fails, so the one retry is spent and the error surfaces.
    // Without the `_retry` flag this is where the client would loop forever.
    let attempts = 0;
    await page.route('**/admin/bookings**', async (route) => {
      attempts += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ data: null, error: 'Invalid or expired token' }),
      });
    });

    await gotoConsole(page, '/bookings');

    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    // Two HTTP calls per query attempt — the original and its one replay — and
    // React Query is configured `retry: 1`, so four in total. Asserted as "even
    // and bounded" rather than exactly four, because a background refetch would
    // add another pair without meaning anything is wrong. What matters is that
    // the replay happens once per attempt: `_retry` is what stops it looping.
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(attempts).toBeLessThanOrEqual(8);
    expect(attempts % 2).toBe(0);
  });
});

test.describe('signing out', () => {
  test('ends the session and does not leave it behind', async ({ browser }) => {
    // Its own context: signing out here must not disturb the saved role state
    // that every other spec in the run depends on.
    const page = await newSignedOutPage(browser);
    await signInToConsole(page, ROLES.superuser.email, ROLES.superuser.password);
    await gotoConsole(page, '/');

    await signOut(page);

    await expectSignedOut(page);

    // The cached token is cleared too, not merely unused — `onIdTokenChanged`
    // firing with no user is what removes it.
    expect(await page.evaluate(() => localStorage.getItem('nanny-admin-token'))).toBeNull();
  });

  test('a protected page is closed again afterwards', async ({ browser }) => {
    const page = await newSignedOutPage(browser);
    await signInToConsole(page, ROLES.superuser.email, ROLES.superuser.password);
    await gotoConsole(page, '/');
    await signOut(page);
    await expectSignedOut(page);

    // Typing the URL back in must not get them in on a stale token.
    await page.goto('/bookings');
    await expectSignedOut(page);
    await expect(page.getByRole('heading', { name: 'Bookings' })).toHaveCount(0);
  });
});

/** Signs out through the sidebar account menu. */
async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
