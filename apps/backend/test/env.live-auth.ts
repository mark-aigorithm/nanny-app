/**
 * Loader for `start:test:live-auth` — the one profile that talks to the real
 * Firebase project (`nanny-now-d8518`, which also serves production) while
 * everything else (rows, mail, payments) stays on the local test stack.
 *
 * Why this can't just be `test/env.ts` plus an env var override on the
 * command line: `test/env.ts` loads `.env.test` with `override: true`, which
 * *unconditionally* re-sets `FIREBASE_AUTH_EMULATOR_HOST` (and the emulator's
 * placeholder `FIREBASE_*` credentials) from that file — clobbering whatever
 * the shell already exported, before `lib/firebase.ts` ever reads it. So
 * `cross-env FIREBASE_AUTH_EMULATOR_HOST= … -r ./test/env.ts` doesn't work:
 * it isn't that an empty string fails to count as "unset" (`lib/firebase.ts`'s
 * own check, `Boolean(process.env['FIREBASE_AUTH_EMULATOR_HOST'])`, would
 * correctly treat `''` as falsy) — it's that `test/env.ts`'s `-r` runs
 * *after* the shell sets that empty value and overwrites it with
 * `.env.test`'s real emulator host before anything downstream gets a look.
 * `lib/config.ts` then loads `.env` *without* override — dotenv leaves an
 * already-set key alone — so even the real credentials in `.env` never win
 * once the emulator placeholders are in place.
 *
 * So this loader runs in a fixed order, entirely in-process:
 *
 *   1. Load `.env.test` (via `test/env.ts`) so the database guard still runs
 *      and the database stays pinned to `nannyapp_test`.
 *   2. Delete `FIREBASE_AUTH_EMULATOR_HOST` so `lib/firebase.ts` (see its
 *      `usingAuthEmulator` check) takes the credential path, not the
 *      emulator path.
 *   3. Read the real Firebase Admin credentials out of `.env` and copy only
 *      those keys into `process.env`, overriding the emulator placeholders
 *      `.env.test` set in step 1.
 *   4. Turn the harness flag on for this process.
 *
 * Never prints, logs, copies, or echoes a value from `.env` beyond the one
 * summary line at the bottom — which names the project id and database, not
 * credentials.
 *
 * Two side effects worth knowing before running this profile:
 *  - `FIREBASE_STORAGE_BUCKET` is deliberately not one of the keys copied
 *    below, so it stays whatever `.env.test` set — the demo bucket
 *    (`demo-nannyapp.appspot.com`), not the live project's bucket.
 *  - Everything else that goes through `lib/firebase.ts`'s admin app —
 *    notably FCM push via `notification.service.ts` — now runs against the
 *    *live* project too. If a device token in the local `nannyapp_test`
 *    database belongs to a real device, this profile can push a real
 *    notification to it.
 */
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

// Step 1: same `.env.test` load + database guard as every other test profile.
import { assertTestDatabase } from './env';

assertTestDatabase();

// Step 2: force lib/firebase.ts onto the credential path.
delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];

// Step 3: pull the real service-account credentials from `.env`. Copying only
// these named keys — never the whole parsed object — matters because `.env`
// also holds a production `DATABASE_URL`, which must never reach this
// process; the database stays whatever `.env.test` set in step 1.
const dotEnvPath = path.join(__dirname, '..', '.env');
const parsedDotEnv = dotenv.parse(fs.readFileSync(dotEnvPath, 'utf8'));

const CREDENTIAL_KEYS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_WEB_API_KEY',
] as const;

for (const key of CREDENTIAL_KEYS) {
  const value = parsedDotEnv[key];
  if (value !== undefined) {
    process.env[key] = value;
  }
}

// FIREBASE_WEB_API_KEY is not a secret — it's the same client key shipped
// inside the Android app — and isn't normally kept in `.env`. Fall back to
// the committed google-services.json rather than requiring a dev to
// hand-copy it in.
if (!process.env['FIREBASE_WEB_API_KEY']) {
  try {
    const googleServicesPath = path.join(__dirname, '..', '..', 'mobile', 'google-services.json');
    const googleServices = JSON.parse(fs.readFileSync(googleServicesPath, 'utf8')) as {
      client: Array<{ api_key: Array<{ current_key: string }> }>;
    };
    const webApiKey = googleServices.client[0]?.api_key[0]?.current_key;
    if (webApiKey) {
      process.env['FIREBASE_WEB_API_KEY'] = webApiKey;
    }
  } catch {
    // No mobile checkout, or the file moved/changed shape. Leave it unset —
    // completeReset() throws its own clear error if it's actually called
    // without a web API key.
  }
}

// Step 4: turn the harness on for this process only.
process.env['E2E_LIVE_AUTH_ENABLED'] = 'true';

const projectId = process.env['FIREBASE_PROJECT_ID'] ?? '';
if (!projectId || projectId.startsWith('demo-')) {
  throw new Error(
    'start:test:live-auth requires a real Firebase project id in apps/backend/.env — got ' +
      `${projectId ? `"${projectId}"` : '(missing)'}. Refusing to start against what looks like ` +
      'an emulator project id.',
  );
}

const databaseName = new URL(process.env['DATABASE_URL'] ?? '').pathname.replace(/^\//, '');

// eslint-disable-next-line no-console
console.log(`[e2e-live-auth] Firebase project "${projectId}", database "${databaseName}".`);
