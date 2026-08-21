/**
 * Runs once, before any integration test, in its own process.
 *
 * Brings the test database to a known state: schema migrated, platform settings
 * seeded, and a snapshot of that seeded baseline written to disk so every
 * per-test reset can restore it without re-running the seed script.
 */
// Must come first. globalSetup runs outside Jest's module registry, so
// `moduleNameMapper` does not apply — without this hook, the first
// `@backend/*` import anywhere in the require chain fails to resolve. The
// application modules this file loads are full of them.
import 'tsconfig-paths/register';

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import '../env';
import { BASELINE_SETTINGS_PATH } from './baseline-path';

const BACKEND_ROOT = path.join(__dirname, '..', '..');

/**
 * `execSync` rather than `execFileSync`: pnpm is a `.cmd` shim on Windows and
 * cannot be spawned without a shell, and passing an argv array *with* a shell
 * is deprecated in Node (the args are concatenated, not escaped). A single
 * fixed command string is the supported form. Every command here is a
 * hard-coded literal, so there is nothing to escape.
 */
function run(command: string): void {
  execSync(command, {
    cwd: BACKEND_ROOT,
    stdio: 'inherit',
    // prisma.config.ts reads DATABASE_URL from the environment and only falls
    // back to apps/backend/.env for keys that are unset — so passing the
    // already-overridden process.env is what aims the CLI at the test database.
    env: process.env,
  });
}

export default async function globalSetup(): Promise<void> {
  // `migrate deploy`, not `migrate dev`: it applies the committed migrations
  // exactly as production will and never invents a new one from schema drift.
  // Running the real migration chain is itself a test — it is the only thing
  // that proves all 49 migrations still apply to an empty database.
  run('pnpm exec prisma migrate deploy');

  await clearSettings();

  // Seeds app_settings (service fee, hourly rate, booking window). The service
  // layer falls back to identical in-code defaults for any missing key, so this
  // is about tests exercising the DB-backed path rather than the fallback.
  run('pnpm exec prisma db seed');

  await snapshotBaseline();
}

/**
 * Empties `app_settings` so the seed below writes the defaults, not whatever is
 * already there.
 *
 * `prisma/seed.ts` upserts with `update: {}` — deliberately, so re-seeding a
 * real environment never clobbers an admin's edits. That makes it a no-op for
 * any key that already exists, and this database is shared: the mobile E2E lab
 * configures the platform for its own flows (a 24-hour care window, no booking
 * lead time). Without this, those values would survive the seed, be captured as
 * the baseline every later test is restored to, and quietly change what the
 * whole integration suite is testing against.
 */
async function clearSettings(): Promise<void> {
  const { prisma } = await import('../../src/db/prisma');
  try {
    await prisma.appSettings.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Caches the seeded app_settings rows.
 *
 * The per-test reset truncates every table, app_settings included — otherwise a
 * test that edits a platform setting would leak into the next one. Restoring
 * from this snapshot gives each test the same DB-backed baseline without
 * duplicating the seed values in test code, where they would silently drift
 * from prisma/seed.ts.
 */
async function snapshotBaseline(): Promise<void> {
  // Imported lazily: the module reads config at import time, which must happen
  // after ../env has rewritten the environment above.
  //
  // A relative path, not the `@backend/*` alias: globalSetup runs outside
  // Jest's module registry, so moduleNameMapper does not apply here.
  const { prisma } = await import('../../src/db/prisma');

  try {
    const settings = await prisma.appSettings.findMany({
      select: { key: true, value: true },
      orderBy: { key: 'asc' },
    });
    fs.writeFileSync(BASELINE_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } finally {
    await prisma.$disconnect();
  }
}
