/**
 * Runs once before the E2E suite.
 *
 * Provisions each console role and saves a signed-in browser state for it, so
 * specs adopt a role in one line instead of repeating a login. Signing in
 * through the real form (rather than injecting a token) means the login page is
 * itself covered before any other spec runs — if authentication is broken, the
 * failure is reported here rather than as every spec redirecting to /login.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type FullConfig } from '@playwright/test';

import { ROLES, storageStatePath, type RoleName } from './roles';

// The admin package is ESM ("type": "module"), so __dirname does not exist.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.join(HERE, '..', '..', 'backend');

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('No baseURL configured — check playwright.config.ts.');

  seedRoles();
  fs.mkdirSync(path.join(HERE, '.auth'), { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const name of Object.keys(ROLES) as RoleName[]) {
      await captureSignedInState(browser, baseURL, name);
    }
  } finally {
    await browser.close();
  }
}

/**
 * Creates the Firebase accounts and `users` rows by delegating to the backend,
 * which owns the Admin SDK and Prisma. ROLES is passed through so this file
 * stays the only place the accounts are described.
 */
function seedRoles(): void {
  execSync(
    'pnpm exec ts-node --transpile-only -r tsconfig-paths/register test/e2e/seed-roles.ts',
    {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, E2E_ROLES: JSON.stringify(Object.values(ROLES)) },
    },
  );
}

async function captureSignedInState(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseURL: string,
  name: RoleName,
): Promise<void> {
  const role = ROLES[name];
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/login');

    // Queried by accessible name: the Field component wraps each input in its
    // <label>, so no test-only attribute is needed here.
    await page.getByLabel('Email').fill(role.email);
    await page.getByLabel('Password').fill(role.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The login form redirects away on success. Waiting for the URL to stop
    // being /login is the signal that Firebase accepted the credentials —
    // asserting on a dashboard element instead would couple this to whichever
    // landing page a role happens to have.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });

    await context.storageState({ path: storageStatePath(name) });
  } finally {
    await context.close();
  }
}
