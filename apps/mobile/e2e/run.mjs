#!/usr/bin/env node
/**
 * Runs the Maestro flows against a local Android emulator.
 *
 * Maestro drives the app; everything the app cannot do to itself — creating the
 * accounts, advancing the nanny's or the admin's side of a flow — happens over
 * the same HTTP the other suites use. This script is the seam between the two.
 *
 * It deliberately does *not* start the emulator, Metro or the backend. Those
 * are long-running processes a person wants in their own terminal, with their
 * own logs; a runner that owned them would hide the output that explains most
 * failures. Instead it checks each one is there and says exactly which command
 * is missing — see e2e/README.md.
 *
 *   node e2e/run.mjs            # every flow in e2e/flows
 *   node e2e/run.mjs smoke      # just e2e/flows/smoke.yaml
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACCOUNTS, PASSWORD, localDigits } from './accounts.mjs';
import { APP_ID, fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = resolve(E2E_DIR, '..');
const REPO_ROOT = resolve(MOBILE_DIR, '..', '..');
const FLOWS_DIR = join(E2E_DIR, 'flows');

/** Where the backend under test listens; the app reaches it at 10.0.2.2 from the emulator. */
const BACKEND_URL = 'http://127.0.0.1:3001';

/**
 * Locates the Maestro CLI.
 *
 * Not assumed to be on PATH: adding it there means editing the user's global
 * PATH, and `setx` truncates it at 1024 characters — a genuinely destructive
 * side effect for a test runner to have. The default install location is
 * checked instead, and MAESTRO_BIN overrides.
 */
function resolveMaestro() {
  const configured = process.env['MAESTRO_BIN'];
  if (configured) {
    if (!existsSync(configured)) fail(`MAESTRO_BIN points at ${configured}, which does not exist.`);
    return configured;
  }

  const candidates =
    process.platform === 'win32'
      ? [join(process.env['LOCALAPPDATA'] ?? '', 'maestro', 'bin', 'maestro.bat')]
      : [join(process.env['HOME'] ?? '', '.maestro', 'bin', 'maestro')];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;

  const onPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['maestro'], {
    encoding: 'utf8',
  });
  if (onPath.status === 0) return onPath.stdout.trim().split(/\r?\n/)[0];

  return fail(
    'Maestro was not found. Install it (see e2e/README.md) or set MAESTRO_BIN to its launcher.',
  );
}

/** The app has to be installed, and it has to be the debug build that talks to the local stack. */
function requireAppInstalled(adb, device) {
  const packages = execFileSync(adb, ['-s', device, 'shell', 'pm', 'list', 'packages', APP_ID], {
    encoding: 'utf8',
  });

  if (!packages.includes(APP_ID)) {
    fail(
      `${APP_ID} is not installed on ${device}. Build and install it:\n` +
        '  pnpm --filter @nanny-app/mobile e2e:build',
    );
  }
}

/** Metro serves the JS *and* the config block that points the app at the local stack. */
async function requireMetro() {
  const response = await fetch('http://127.0.0.1:8081/status').catch(() => null);
  if (!response?.ok) {
    fail(
      'No Metro bundler on :8081. A debug build loads its JS from there:\n' +
        '  pnpm --filter @nanny-app/mobile e2e:metro',
    );
  }
}

/** The flows sign in against real accounts, so the backend has to be up. */
async function requireBackend() {
  const response = await fetch(`${BACKEND_URL}/health`).catch(() => null);
  if (!response?.ok) {
    fail(
      `No backend answering at ${BACKEND_URL}. Start the stack and the test backend:\n` +
        '  pnpm test:env\n' +
        '  pnpm --filter @nanny-app/backend start:test',
    );
  }
}

/** Provisions the accounts the flows sign in as, through the backend's own script. */
function seedAccounts() {
  console.log('[e2e] seeding accounts…');
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@nanny-app/backend',
      'exec',
      'ts-node',
      '--transpile-only',
      '-r',
      'tsconfig-paths/register',
      'test/e2e/seed-mobile.ts',
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, E2E_MOBILE_ACCOUNTS: JSON.stringify(Object.values(ACCOUNTS)) },
    },
  );

  if (result.status !== 0) fail('Seeding failed — see the output above.');
}

/**
 * Maps :8081 inside the emulator to Metro on the host.
 *
 * Without this the dev-client link would have to name `10.0.2.2`, which works
 * but bakes the emulator's host alias into every flow. `adb reverse` keeps the
 * flows saying `localhost`, so they read the same as they would on a physical
 * device over USB.
 */
function reverseMetroPort(adb, device) {
  const result = spawnSync(adb, ['-s', device, 'reverse', 'tcp:8081', 'tcp:8081'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`adb reverse for Metro failed: ${result.stderr?.trim() || 'unknown error'}`);
  }
}

/**
 * Silences the system UI that otherwise lands on top of the app mid-flow.
 *
 * The API 35 image ships a stylus, and Gboard greets the first tap into a text
 * field with a full-screen "Try out your stylus" tutorial — which covers the
 * form the flow is filling in and fails it on a selector that is genuinely
 * there. Nothing in the app can prevent it; it has to be turned off on the
 * device.
 */
function quietDeviceChrome(adb, device) {
  spawnSync(adb, ['-s', device, 'shell', 'settings', 'put', 'secure', 'stylus_handwriting_enabled', '0']);
}

function flowsToRun(requested) {
  const available = readdirSync(FLOWS_DIR)
    // `_`-prefixed files are shared subflows (see flows/_launch.yaml), not tests.
    .filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
    .sort();

  if (requested.length === 0) return available;

  return requested.map((name) => {
    const file = name.endsWith('.yaml') ? name : `${name}.yaml`;
    // Flows are named for the catalogue (a01-…), so a prefix is enough to pick one.
    const match = available.find((candidate) => candidate === file || candidate.startsWith(name));
    if (!match) fail(`No flow matches "${name}". Available: ${available.join(', ')}`);
    return match;
  });
}

function runFlow(maestro, flow) {
  console.log(`\n[e2e] ── ${flow} ─────────────────────────────`);

  const result = spawnSync(
    maestro,
    [
      'test',
      join(FLOWS_DIR, flow),
      '-e',
      `MOTHER_PHONE=${localDigits(ACCOUNTS.mother.phone)}`,
      '-e',
      `NANNY_PHONE=${localDigits(ACCOUNTS.nanny.phone)}`,
      '-e',
      `PASSWORD=${PASSWORD}`,
    ],
    {
      cwd: E2E_DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        // Maestro's cloud analysis is an upsell we never use; the prompt only
        // adds noise to CI output.
        MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
      },
    },
  );

  return result.status === 0;
}

async function main() {
  const maestro = resolveMaestro();
  const adb = resolveAdb();
  const device = requireBootedDevice(adb);
  if (!isBooted(adb, device)) {
    fail(`${device} is attached but still booting. Wait for the home screen and try again.`);
  }
  requireAppInstalled(adb, device);
  await requireBackend();
  await requireMetro();
  reverseMetroPort(adb, device);
  quietDeviceChrome(adb, device);

  console.log(`[e2e] device ${device}, maestro ${maestro}`);
  seedAccounts();

  const flows = flowsToRun(process.argv.slice(2));
  const failed = flows.filter((flow) => !runFlow(maestro, flow));

  console.log(`\n[e2e] ${flows.length - failed.length}/${flows.length} flows passed.`);
  if (failed.length > 0) {
    console.error(`[e2e] failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

await main();
