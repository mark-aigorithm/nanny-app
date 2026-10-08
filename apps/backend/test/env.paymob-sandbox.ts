/**
 * Loader for `start:test:paymob-sandbox`: the test backend, paying through
 * Paymob's real TEST-mode sandbox instead of the local fake.
 *
 * Everything except Paymob stays on the local test stack: the database
 * (pinned to `nannyapp_test` by test/env.ts), the Auth and Storage emulators,
 * and Mailpit. So the E2E suites seed and sign in exactly as they do against
 * the fake. They pick this profile with PAYMOB_MODE=sandbox
 * (test-support/paymob/mode.mjs), and that is the only thing that changes for
 * them.
 *
 * In order:
 *
 *   1. Load `.env.test` through test/env.ts, with its database guard.
 *   2. Read `.env.paymob-sandbox.local`, which is gitignored and filled in by
 *      hand from the Paymob dashboard in TEST mode. Copy only the named keys,
 *      never the whole file, the same way env.live-auth.ts does.
 *   3. If that file gives no PUBLIC_API_URL, take the tunnel URL that
 *      `pnpm paymob:tunnel` wrote. The backend puts it on every intention as
 *      `notification_url` and `redirection_url`, which is how Paymob's webhook
 *      reaches this machine.
 *   4. Point the API client at Paymob and listen on :3002, so a run in fake
 *      mode (which expects :3001) can never reach this backend.
 *   5. Refuse to start on a live key, an http URL or a missing value
 *      (test/paymob-sandbox-guard.ts).
 *
 * Prints one summary line naming the mode, port, tunnel host and integration
 * ids, and never a key.
 */
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

import { assertTestDatabase } from './env';
import { PAYMOB_SANDBOX_KEYS, paymobSandboxProblems } from './paymob-sandbox-guard';

assertTestDatabase();

const BACKEND_DIR = path.join(__dirname, '..');
const KEYS_FILE = path.join(BACKEND_DIR, '.env.paymob-sandbox.local');
/** Written by scripts/paymob-tunnel.mjs; one line, the tunnel's https origin. */
const TUNNEL_FILE = path.join(BACKEND_DIR, '.paymob-sandbox-tunnel');

/** The sandbox profile's port; test-support/paymob/mode.mjs names the same one. */
const SANDBOX_PORT = '3002';

if (!fs.existsSync(KEYS_FILE)) {
  throw new Error(
    'start:test:paymob-sandbox needs apps/backend/.env.paymob-sandbox.local. Copy ' +
      '.env.paymob-sandbox.example to it and fill in the TEST-mode values from the Paymob ' +
      'dashboard (see apps/mobile/e2e/README.md, "Paymob: fake or sandbox").',
  );
}

const parsed = dotenv.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
for (const key of PAYMOB_SANDBOX_KEYS) {
  const value = parsed[key]?.trim();
  if (value) process.env[key] = value;
  // Not left at .env.test's value: a fake key or a loopback URL that slipped
  // through would fail at Paymob with a far less legible error.
  else delete process.env[key];
}

if (!process.env['PUBLIC_API_URL'] && fs.existsSync(TUNNEL_FILE)) {
  process.env['PUBLIC_API_URL'] = fs.readFileSync(TUNNEL_FILE, 'utf8').trim();
}

// Set rather than deleted: lib/config.ts loads apps/backend/.env after this,
// without override, and an unset key would let a value from there through.
process.env['PAYMOB_API_BASE_URL'] = 'https://accept.paymob.com';
process.env['PORT'] = SANDBOX_PORT;

const problems = paymobSandboxProblems(process.env);
if (problems.length > 0) {
  throw new Error(
    `Refusing to start the Paymob sandbox profile:\n  - ${problems.join('\n  - ')}\n` +
      'Values come from apps/backend/.env.paymob-sandbox.local; the tunnel URL from `pnpm paymob:tunnel`.',
  );
}

// eslint-disable-next-line no-console
console.log(
  `[paymob-sandbox] Paymob TEST mode on :${SANDBOX_PORT}, webhooks via ` +
    `${new URL(process.env['PUBLIC_API_URL'] ?? '').host}, integrations ${process.env['PAYMOB_PAYMENT_METHOD_IDS']}.`,
);
