/**
 * Proves the Playwright harness against the full stack.
 *
 * Passing means: Vite served the app, the Auth emulator issued a token through
 * the real login form, global-setup's saved session survived into a fresh
 * browser context, the backend accepted that token over real HTTP, and an
 * unauthenticated visitor is still bounced to /login.
 *
 * The real journey specs are a separate piece of work; this only has to fail
 * when the environment is wrong.
 */
import { expect, test } from '@playwright/test';

import { storageStatePath } from './roles';

test.describe('signed in as superuser', () => {
  test.use({ storageState: storageStatePath('superuser') });

  test('restores the saved session instead of redirecting to login', async ({ page }) => {
    await page.goto('/');

    await expect(page).not.toHaveURL(/\/login/);
  });

  test('loads authenticated data from the backend', async ({ page }) => {
    // Observe the request the *app* makes, rather than issuing one from the
    // test context: only the app's axios interceptor attaches the Firebase
    // token, so this is the sole way to exercise the real authenticated path.
    // A 401 here would mean verifyIdToken rejected the emulator's token —
    // usually because the two sides disagree about the project id.
    const mePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/admin/me') && response.request().method() === 'GET',
    );

    await page.goto('/');

    expect((await mePromise).status()).toBe(200);
  });
});

test.describe('signed out', () => {
  // Explicitly no storage state: this context must look like a first visit.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects an anonymous visitor to the login page', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
