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

import { ACCOUNTS, ADMIN, PASSWORD, localDigits, placeholderEmail } from './accounts.mjs';
import { APP_ID, fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';
import { CARE_POINTS, PACKAGE, PLATFORM_SETTINGS, PROMO_CODES } from './fixtures.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = resolve(E2E_DIR, '..');
const REPO_ROOT = resolve(MOBILE_DIR, '..', '..');
const FLOWS_DIR = join(E2E_DIR, 'flows');

/** Where the backend under test listens; the app reaches it at 10.0.2.2 from the emulator. */
const BACKEND_URL = 'http://127.0.0.1:3001';

/** Where the Firebase Auth emulator listens, for the same reason. */
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

/** The Paymob fake, for the flows whose *other* side has to pay over HTTP. */
const PAYMOB_FAKE_URL = 'http://127.0.0.1:4010';

/**
 * The platform's own timezone — the one booking times are expressed in.
 *
 * `CreateBookingSchema` takes a wall-clock string with no offset and reads it
 * in this zone, so a booking seeded from the host has to be written in it too.
 * Sending the host's local time would be an hour or more out for half the year.
 */
const PLATFORM_TIMEZONE = 'Africa/Cairo';

/**
 * A wall-clock `YYYY-MM-DDTHH:mm:ss` in the platform's timezone, `minutes`
 * from now.
 *
 * Computed here rather than in a flow because Maestro's JS sandbox has no
 * `Intl` timezone support worth relying on, and because the value has to be the
 * same for every step of one flow.
 */
function wallClockIn(minutes) {
  const at = new Date(Date.now() + minutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00';
  // `en-CA` renders midnight as 24 rather than 00 in some ICU builds.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`;
}

/**
 * The emulator's project, which its admin endpoints put in the path.
 *
 * Must match `.firebaserc`, `.env.test` and the `--project` the emulator is
 * started with — they are one id wearing four hats, and a mismatch shows up as
 * an empty result rather than an error.
 */
const AUTH_PROJECT_ID = 'demo-nannyapp';

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

  await warmMetro();
}

/**
 * Builds the bundle once, before any flow asks the device for it — and refuses
 * to run if it cannot be built.
 *
 * Two separate problems, both of which reach a flow as `_launch.yaml` failing
 * to find the developer menu, which reads like a broken selector for something
 * that is genuinely not on screen:
 *
 *   1. `e2e:metro` starts with `--clear`, so the first request pays for the
 *      whole build — over a minute. The dev client's own fetch times out first
 *      and the app shows "There was a problem loading the project".
 *   2. `metro-file-map`'s watcher gives up after four minutes of crawling this
 *      monorepo when the machine is busy ("Failed to start watch mode"). Metro
 *      then still answers `/status` with 200 while every bundle request returns
 *      a 500 from DependencyGraph. A liveness ping cannot tell the two apart —
 *      only asking for the bundle can.
 *
 * So this is fatal rather than advisory: a Metro that cannot build is not a
 * slow prerequisite, it is a missing one.
 */
async function warmMetro() {
  const url =
    'http://127.0.0.1:8081/.expo/.virtual-metro-entry.bundle' +
    '?platform=android&dev=true&hot=false&transform.engine=hermes';

  process.stdout.write('[e2e] building the bundle… ');
  const started = Date.now();
  const response = await fetch(url).catch(() => null);
  const seconds = Math.round((Date.now() - started) / 1000);

  if (response?.ok) {
    console.log(`ready in ${seconds}s`);
    return;
  }

  const detail = response
    ? `${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`
    : 'no response at all';

  console.log('failed');
  fail(
    `Metro is listening but cannot build a bundle (${detail}).\n\n` +
      'Most often its file watcher timed out while crawling the monorepo, which leaves\n' +
      '/status answering 200 on a bundler that can no longer serve anything. Restart it:\n' +
      '  pnpm --filter @nanny-app/mobile e2e:metro',
  );
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

/** Provisions the accounts and catalogue rows the flows spend, through the backend's own script. */
function seedLab() {
  console.log('[e2e] seeding…');
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
      env: {
        ...process.env,
        E2E_MOBILE_ACCOUNTS: JSON.stringify(Object.values(ACCOUNTS)),
        E2E_LAB_FIXTURES: JSON.stringify({
          platformSettings: PLATFORM_SETTINGS,
          promoCodes: Object.values(PROMO_CODES),
          package: PACKAGE,
          carePoints: CARE_POINTS,
          admin: ADMIN,
        }),
      },
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

  // Android's package verifier has to be off, or Maestro's driver APK — which
  // it reinstalls at the start of every flow — intermittently fails with
  // `INSTALL_FAILED_VERIFICATION_FAILURE: Integrity verification timed out`.
  // The verifier wants to phone home about an unknown APK and gives up after a
  // timeout; on a loaded machine it loses that race often enough to fail a run
  // that has nothing to do with the app. Nothing here is an APK from anywhere
  // but this repo.
  spawnSync(adb, ['-s', device, 'shell', 'settings', 'put', 'global', 'verifier_verify_adb_installs', '0']);
  spawnSync(adb, ['-s', device, 'shell', 'settings', 'put', 'global', 'package_verifier_enable', '0']);
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

/**
 * Protects a value that contains a space.
 *
 * Maestro's launcher is a `.bat`, which Node can only spawn through a shell —
 * and with a shell the argv array is *concatenated*, not passed through, so a
 * package name like "E2E Starter" arrives as two arguments and the second is
 * read as a flow path. Values here are ours and never contain quotes.
 */
function quoteArg(value) {
  return value.includes(' ') ? `"${value}"` : value;
}

function runFlow(maestro, flow) {
  console.log(`\n[e2e] ── ${flow} ─────────────────────────────`);

  // The phones are what a flow types; the emails and URLs are what
  // scripts/advance.js needs to drive the other side of a journey over HTTP.
  const params = {
    MOTHER_PHONE: localDigits(ACCOUNTS.mother.phone),
    NANNY_PHONE: localDigits(ACCOUNTS.nanny.phone),
    GATED_MOTHER_PHONE: localDigits(ACCOUNTS.gatedMother.phone),
    PENDING_NANNY_PHONE: localDigits(ACCOUNTS.pendingNanny.phone),
    MOTHER_EMAIL: placeholderEmail(ACCOUNTS.mother.phone),
    NANNY_EMAIL: placeholderEmail(ACCOUNTS.nanny.phone),
    GATED_MOTHER_EMAIL: placeholderEmail(ACCOUNTS.gatedMother.phone),
    PENDING_NANNY_EMAIL: placeholderEmail(ACCOUNTS.pendingNanny.phone),
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    PASSWORD,
    BACKEND_URL,
    AUTH_EMULATOR_URL,
    AUTH_PROJECT_ID,
    PAYMOB_FAKE_URL,
    // Ten minutes out, which is inside the fifteen-minute check-in window — so
    // a flow that seeds a booking over HTTP can start the shift immediately,
    // without the date picker that A1 and A7 have to walk.
    BOOKING_START: wallClockIn(10),
    // Two hours is the platform minimum, so this is the shortest bookable
    // shift — the flow only needs it to have started, not to run its course.
    BOOKING_END: wallClockIn(130),
    PROMO_CODE: PROMO_CODES.reusable.code,
    PROMO_CODE_EXHAUSTED: PROMO_CODES.exhausted.code,
    PACKAGE_NAME: PACKAGE.name,
  };

  const result = spawnSync(
    maestro,
    [
      'test',
      join(FLOWS_DIR, flow),
      ...Object.entries(params).flatMap(([key, value]) => ['-e', quoteArg(`${key}=${value}`)]),
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

  const flows = flowsToRun(process.argv.slice(2));
  // Re-seeded before every flow, not once per run. Each flow books the same
  // nanny for the next few hours, and the second one to try would be refused
  // for double-booking her — so without this the suite would only pass in the
  // order it happened to be written in. Seeding undoes the previous flow as
  // well as the previous run, which is also what makes a single flow runnable
  // on its own.
  const failed = flows.filter((flow) => {
    seedLab();
    return !runFlow(maestro, flow);
  });

  console.log(`\n[e2e] ${flows.length - failed.length}/${flows.length} flows passed.`);
  if (failed.length > 0) {
    console.error(`[e2e] failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

await main();
