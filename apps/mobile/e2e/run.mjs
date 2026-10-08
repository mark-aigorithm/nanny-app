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
 *   node e2e/run.mjs --paymob=sandbox a01
 *                               # paying through Paymob's real TEST-mode
 *                               # sandbox instead of the fake (or set
 *                               # PAYMOB_MODE=sandbox)
 *
 * The flows are the same in both Paymob modes. Each pays by typing a test card
 * into whichever checkout page Metro points the app at; see
 * test-support/paymob/mode.mjs for what the flag changes.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCOUNTS,
  ADMIN,
  EMAIL_DOOR_COLLISION,
  LEFTOVER,
  PASSWORD,
  REGISTRATION,
  REGISTRATION_NANNY,
  SOCIAL_COLLISION,
  SOCIAL_NANNY_REGISTRATION,
  SOCIAL_REGISTRATION,
  localDigits,
} from './accounts.mjs';
import { CHECKOUT, resolvePaymobMode, withoutPaymobFlag } from '../../../test-support/paymob/mode.mjs';

import { fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';
import { CARE_POINTS, PACKAGE, PLATFORM_SETTINGS, PROMO_CODES } from './fixtures.mjs';
import {
  quietDeviceChrome,
  requireAppInstalled,
  requireMetro,
  requireMetroFor,
  requireMetroPaymob,
  resolveMaestro,
  reverseMetroPort,
  runMaestro,
} from './lab.mjs';
import { PAYER_PORT, startPayer } from './payer.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = resolve(E2E_DIR, '..');
const REPO_ROOT = resolve(MOBILE_DIR, '..', '..');
const FLOWS_DIR = join(E2E_DIR, 'flows');

/**
 * Which Paymob this run pays through, and so which backend it talks to: the
 * fake-mode backend on :3001 or the sandbox one on :3002. The app reaches
 * either at 10.0.2.2 from the emulator.
 */
const PAYMOB = (() => {
  try {
    return resolvePaymobMode();
  } catch (err) {
    fail(err.message);
  }
})();
const BACKEND_URL = PAYMOB.backendUrl;

/** Where the Firebase Auth emulator listens, for the same reason. */
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

/** payer.mjs, for the flows whose *other* side has to pay (advance.js mother-pay). */
const PAYER_URL = `http://127.0.0.1:${PAYER_PORT}`;

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
      `No backend answering at ${BACKEND_URL} (PAYMOB_MODE=${PAYMOB.mode}). Start the stack and ` +
        'the test backend:\n' +
        '  pnpm test:env\n' +
        `  ${PAYMOB.backendScript}`,
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
        // — otherwise the second run collides on the unique phone. Two mothers
        // (C2/C7, C11), one nanny (A10), C12's Google identity, C13's nanny
        // Google sign-up, and C15's leftover (wiped clean before it is re-seeded
        // as a Firebase-only account below).
        E2E_MOBILE_WIPE: JSON.stringify([
          { phone: REGISTRATION.phone, email: REGISTRATION.email },
          { phone: REGISTRATION_NANNY.phone, email: REGISTRATION_NANNY.email },
          // C11 signs up with Google from scratch; C12's throwaway Google
          // account has no phone, only the address.
          { phone: SOCIAL_REGISTRATION.phone, email: SOCIAL_REGISTRATION.email },
          { email: SOCIAL_COLLISION.email },
          // C13 signs up with Google as a nanny, from scratch.
          {
            phone: SOCIAL_NANNY_REGISTRATION.phone,
            role: SOCIAL_NANNY_REGISTRATION.role,
            email: SOCIAL_NANNY_REGISTRATION.email,
          },
          // C15's leftover: freed here, then re-created as a Firebase-only
          // account (no row) by E2E_MOBILE_LEFTOVERS below.
          { phone: LEFTOVER.phone, email: LEFTOVER.email },
        ]),
        // Firebase-only accounts with no `users` row — the "sign-up stopped
        // mid-way" state C15 resumes. Processed right after the wipe above, so
        // each run gets a fresh uid under the same phone/email.
        E2E_MOBILE_LEFTOVERS: JSON.stringify([
          { phone: LEFTOVER.phone, email: LEFTOVER.email, password: LEFTOVER.password },
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

  // The emails are what a flow signs in with (_sign-in.yaml) and what
  // scripts/advance.js signs in as to drive the other side of a journey over
  // HTTP; the phones are what a flow types into a phone field.
  const params = {
    // C12 types the seeded mother's number to collide with her account.
    MOTHER_PHONE: localDigits(ACCOUNTS.mother.phone),
    // The full E.164, for the phone-otp advance step: the emulator keys every
    // verification code it issues by the number the app dialled, and that is
    // the country code plus the digits, not the digits a person types.
    MOTHER_PHONE_E164: ACCOUNTS.mother.phone,
    // The throwaway account a registration flow signs up as — the digits it
    // types, the E.164 the phone-otp step reads, and the real address she
    // types on "About you", then proves and links as her Firebase sign-in
    // credential on "Secure your account".
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
    // Google sign-up (C11): the address typed into the E2E Google picker, and
    // the number the social wizard links onto that Google account.
    SOCIAL_REGISTRATION_EMAIL: SOCIAL_REGISTRATION.email,
    SOCIAL_REGISTRATION_PHONE: localDigits(SOCIAL_REGISTRATION.phone),
    SOCIAL_REGISTRATION_PHONE_E164: SOCIAL_REGISTRATION.phone,
    // Collision B (C12): a new Google identity that types the seeded mother's
    // number, so it must end up linked onto her account.
    SOCIAL_COLLISION_EMAIL: SOCIAL_COLLISION.email,
    // Google sign-up as a nanny (C13): same shape as C11, but she carries on
    // through the ID and professional-details steps a nanny alone sees.
    SOCIAL_NANNY_REGISTRATION_EMAIL: SOCIAL_NANNY_REGISTRATION.email,
    SOCIAL_NANNY_REGISTRATION_PHONE: localDigits(SOCIAL_NANNY_REGISTRATION.phone),
    SOCIAL_NANNY_REGISTRATION_PHONE_E164: SOCIAL_NANNY_REGISTRATION.phone,
    // Collision A (C14): a Google *sign-in* with an email that already has a
    // password account — the seeded mother's own address.
    EMAIL_DOOR_COLLISION_EMAIL: EMAIL_DOOR_COLLISION.email,
    // The leftover (C15): a Firebase account with no row, resumed from the
    // phone door.
    LEFTOVER_PHONE: localDigits(LEFTOVER.phone),
    LEFTOVER_PHONE_E164: LEFTOVER.phone,
    LEFTOVER_EMAIL: LEFTOVER.email,
    LEFTOVER_FIRST_NAME: LEFTOVER.firstName,
    MAILPIT_URL,
    MOTHER_EMAIL: ACCOUNTS.mother.email,
    NANNY_EMAIL: ACCOUNTS.nanny.email,
    GATED_MOTHER_EMAIL: ACCOUNTS.gatedMother.email,
    PENDING_NANNY_EMAIL: ACCOUNTS.pendingNanny.email,
    // C17 deletes this account, then proves its number is free again by
    // signing in with SMS: the digits it types, and the E.164 the phone-otp
    // advance step reads the code back by.
    DELETABLE_EMAIL: ACCOUNTS.deletable.email,
    DELETABLE_PHONE: localDigits(ACCOUNTS.deletable.phone),
    DELETABLE_PHONE_E164: ACCOUNTS.deletable.phone,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    PASSWORD,
    BACKEND_URL,
    AUTH_EMULATOR_URL,
    AUTH_PROJECT_ID,
    PAYER_URL,
    // The hosted checkout, as _pay-checkout.yaml types into it. The same values
    // in both Paymob modes; see test-support/paymob/checkout.json.
    CHECKOUT_CARD_NUMBER_LABEL: CHECKOUT.labels.cardNumber,
    CHECKOUT_EXPIRY_LABEL: CHECKOUT.labels.expiry,
    CHECKOUT_CVV_LABEL: CHECKOUT.labels.cvv,
    CHECKOUT_NAME_LABEL: CHECKOUT.labels.name,
    CHECKOUT_PAY_LABEL: CHECKOUT.labels.pay,
    CHECKOUT_3DS_TITLE: CHECKOUT.labels.threeDsTitle,
    CHECKOUT_3DS_SUBMIT: CHECKOUT.labels.threeDsSubmit,
    CARD_NUMBER: CHECKOUT.cards.approved.number,
    CARD_EXPIRY: CHECKOUT.cards.approved.expiry,
    CARD_CVV: CHECKOUT.cards.approved.cvv,
    CARD_NAME: CHECKOUT.cards.approved.name,
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
  // The seeder and every advance.js step talk to the Auth emulator; a live
  // Metro would point the app at the real project instead.
  await requireMetroFor('emulator');
  await requireMetroPaymob(PAYMOB);
  reverseMetroPort(adb, device);
  quietDeviceChrome(adb, device);

  console.log(`[e2e] device ${device}, maestro ${maestro}, Paymob ${PAYMOB.mode}`);

  const flows = flowsToRun(withoutPaymobFlag(process.argv.slice(2)));
  const stopPayer = await startPayer({ checkoutOrigin: PAYMOB.checkoutOrigin }).catch((err) =>
    fail(`Could not start the checkout payer on :${PAYER_PORT}: ${err.message}`),
  );
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
  await stopPayer();

  console.log(`\n[e2e] ${flows.length - failed.length}/${flows.length} flows passed.`);
  if (failed.length > 0) {
    console.error(`[e2e] failed: ${failed.join(', ')}`);
    process.exit(1);
  }
}

await main();
