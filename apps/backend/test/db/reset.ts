/**
 * The reset every integration test runs in `beforeEach`: wipe, then restore the
 * seeded baseline. After it returns, the database is byte-for-byte what it was
 * when global-setup finished — which is what makes tests order-independent.
 */
import fs from 'node:fs';

import { prisma } from '@backend/db/prisma';

import { BASELINE_SETTINGS_PATH } from './baseline-path';
import { truncateAll } from './truncate';

type SettingRow = { key: string; value: string };

let cachedBaseline: SettingRow[] | null = null;

/** Reads the snapshot global-setup wrote, once per worker process. */
function loadBaseline(): SettingRow[] {
  if (cachedBaseline) return cachedBaseline;

  if (!fs.existsSync(BASELINE_SETTINGS_PATH)) {
    throw new Error(
      `Baseline settings snapshot missing at ${BASELINE_SETTINGS_PATH}. ` +
        'It is written by test/db/global-setup.ts — is the integration Jest ' +
        'project configured with globalSetup?',
    );
  }

  cachedBaseline = JSON.parse(
    fs.readFileSync(BASELINE_SETTINGS_PATH, 'utf8'),
  ) as SettingRow[];

  return cachedBaseline;
}

export async function resetDatabase(): Promise<void> {
  await truncateAll();

  const baseline = loadBaseline();
  if (baseline.length > 0) {
    await prisma.appSettings.createMany({ data: baseline });
  }
}
