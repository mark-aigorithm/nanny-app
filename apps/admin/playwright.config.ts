import { defineConfig, devices } from '@playwright/test';

import { resolvePaymobMode } from '../../test-support/paymob/mode.mjs';

/**
 * End-to-end configuration for the admin console.
 *
 * Specs run against the real Vite app, the real backend, the real PostGIS test
 * database and the Firebase Auth emulator — the full stack from
 * `pnpm test:env`, plus the Paymob-sandbox backend on :3002 and its tunnel
 * (`start:test:paymob-sandbox`, `pnpm paymob:tunnel`). Nothing is stubbed; the
 * only substitutions are the local database and the local Auth issuer, and
 * seeded payments go through Paymob's real TEST-mode checkout.
 *
 * PAYMOB_MODE=fake swaps Paymob for the local fake, with the console on the
 * fake's backend on :3001 (test-support/paymob/mode.mjs). Specs do not change.
 */
const PAYMOB = resolvePaymobMode([], process.env);
const PORT = 5174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Where global-setup saves the signed-in browser state for each role. */
export const STORAGE_STATE_DIR = './e2e/.auth';

export default defineConfig({
  testDir: './e2e',
  // Specs share one database, so they must not run concurrently until each one
  // owns its own data. Revisit when the suites seed isolated fixtures.
  fullyParallel: false,
  workers: 1,
  // Retry once locally too: a first-run failure that passes on retry is a flake
  // worth seeing in the report rather than an intermittent red build.
  retries: process.env['CI'] ? 2 : 1,
  // Fail the build if a spec was committed with `test.only`.
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['html'], ['github']] : [['html', { open: 'never' }]],

  // The console boots through two sequential async gates before it renders
  // anything: RequireAuth returns null until Firebase restores the session, and
  // PermissionsProvider then blocks on /admin/me. WebKit is materially slower
  // through both, and the 5s default left first-navigation assertions racing a
  // cold start. Specs also call `gotoConsole`, which waits for the shell.
  // Against Paymob's sandbox, a screen that waits on Paymob (a refund's
  // "Refund issued") can take longer than that, so the wait is longer there.
  expect: { timeout: PAYMOB.mode === 'sandbox' ? 30_000 : 10_000 },

  // A seeded paid booking is paid on the hosted checkout. The fake answers at
  // once, but a real sandbox payment takes about 30 seconds through 3-D Secure
  // and Paymob's redirect countdown, the whole of the default test timeout.
  timeout: PAYMOB.mode === 'sandbox' ? 180_000 : 30_000,

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    // Captured only on a retry: full traces on every run are large and slow,
    // but the one run that matters — the failing one — is always recorded.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit catches the Safari-only CSS and date-parsing differences that
    // Chromium silently tolerates.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    // A dedicated port so a dev server already running on 5173 is left alone.
    // `--host 127.0.0.1` is not cosmetic: Vite otherwise binds "localhost",
    // which on Windows resolves to IPv6 ::1, and the readiness probe against
    // the IPv4 baseURL below would never succeed.
    command: `pnpm vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    env: {
      // Talk to the test backend directly rather than through Vite's proxy, so
      // the target is explicit in one place.
      VITE_API_BASE_URL: process.env['E2E_API_BASE_URL'] ?? PAYMOB.backendUrl,
      VITE_FIREBASE_AUTH_EMULATOR_HOST:
        process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '127.0.0.1:9099',
      // Must match the emulator's --project and the backend's FIREBASE_PROJECT_ID:
      // firebase-admin rejects a token whose project id differs from its own.
      VITE_FIREBASE_PROJECT_ID: 'demo-nannyapp',
      VITE_FIREBASE_API_KEY: 'fake-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-nannyapp.firebaseapp.com',
    },
  },
});
