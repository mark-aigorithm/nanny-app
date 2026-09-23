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
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCOUNTS,
  ADMIN,
  PASSWORD,
  REGISTRATION,
  REGISTRATION_NANNY,
  localDigits,
} from './accounts.mjs';
import { fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';
import { CARE_POINTS, PACKAGE, PLATFORM_SETTINGS, PROMO_CODES } from './fixtures.mjs';
import {
  quietDeviceChrome,
  requireAppInstalled,
  requireMetro,
  resolveMaestro,
  reverseMetroPort,
  runMaestro,
} from './lab.mjs';

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

/** Mailpit's HTTP API, where the backend's email OTPs land for the email-otp step. */
const MAILPIT_URL = 'http://127.0.0.1:8025';

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
        // The registration flows sign these accounts up from scratch, so the
        // seeder wipes them (Firebase user + DB row) rather than upserting them
        // — otherwise the second run collides on the unique phone. One mother
        // (C2/C7), one nanny (A10).
        E2E_MOBILE_WIPE: JSON.stringify([
          { phone: REGISTRATION.phone, role: REGISTRATION.role, email: REGISTRATION.email },
          {
            phone: REGISTRATION_NANNY.phone,
            role: REGISTRATION_NANNY.role,
            email: REGISTRATION_NANNY.email,
          },
        ]),
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

  // The phones are what a flow types; the emails and URLs are what
  // scripts/advance.js needs to drive the other side of a journey over HTTP.
  const params = {
    MOTHER_PHONE: localDigits(ACCOUNTS.mother.phone),
    NANNY_PHONE: localDigits(ACCOUNTS.nanny.phone),
    GATED_MOTHER_PHONE: localDigits(ACCOUNTS.gatedMother.phone),
    PENDING_NANNY_PHONE: localDigits(ACCOUNTS.pendingNanny.phone),
    // The full E.164, for the phone-otp advance step: the emulator keys every
    // verification code it issues by the number the app dialled, and that is
    // the country code plus the digits, not the digits a person types.
    MOTHER_PHONE_E164: ACCOUNTS.mother.phone,
    // The throwaway account a registration flow signs up as — the digits it
    // types, the E.164 the phone-otp step reads, and the real address she
    // types on step 1, proves on step 2, and links as her Firebase sign-in
    // credential.
    REGISTRATION_PHONE: localDigits(REGISTRATION.phone),
    REGISTRATION_PHONE_E164: REGISTRATION.phone,
    REGISTRATION_EMAIL: REGISTRATION.email,
    REGISTRATION_FIRST_NAME: REGISTRATION.firstName,
    // The nanny sign-up (A10): her digits + E.164 for the phone step, and the
    // real address she verifies against the email OTP read from Mailpit.
    REGISTRATION_NANNY_PHONE: localDigits(REGISTRATION_NANNY.phone),
    REGISTRATION_NANNY_PHONE_E164: REGISTRATION_NANNY.phone,
    REGISTRATION_NANNY_EMAIL: REGISTRATION_NANNY.email,
    REGISTRATION_NANNY_FIRST_NAME: REGISTRATION_NANNY.firstName,
    MAILPIT_URL,
    MOTHER_EMAIL: ACCOUNTS.mother.email,
    NANNY_EMAIL: ACCOUNTS.nanny.email,
    GATED_MOTHER_EMAIL: ACCOUNTS.gatedMother.email,
    PENDING_NANNY_EMAIL: ACCOUNTS.pendingNanny.email,
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

  return runMaestro(maestro, join(FLOWS_DIR, flow), params);
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
