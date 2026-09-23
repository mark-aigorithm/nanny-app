#!/usr/bin/env node
/**
 * The live-Firebase auth suite.
 *
 * Everything else runs against the Auth emulator; these five flows must not,
 * because what they check is how the real project behaves — phone sign-in, the
 * password credential, and Firebase's own reset mail. The numbers below are the
 * two console test numbers reserved for automation: their codes are fixed, no
 * SMS is sent, and the backend harness refuses every other number.
 *
 *   node e2e/live.mjs              # all five
 *   node e2e/live.mjs reset-email  # one
 *
 * Requires the test stack (`pnpm test:env`), the backend started with
 * `pnpm --filter=@nanny-app/backend start:test:live-auth`, Metro started with
 * `pnpm --filter @nanny-app/mobile e2e:metro:live`, and the emulator. The APK is
 * the ordinary `e2e:build` one: a debug build takes its config from Metro, so
 * it is the live Metro that points Auth at the real project (and keeps Storage
 * on the emulator). See e2e/README.md, "Live-Firebase auth suite".
 *
 * Every run, whatever it was asked for:
 *
 *   1. POST /e2e-auth/begin. The backend refuses if either number already has
 *      a Firebase account — that account pre-dates this run and a person has to
 *      look at it — and then this runner stops without purging anything. It
 *      never deletes an account it did not create.
 *   2. Registers the managed account through the app, once
 *      (flows/live/_register-managed.yaml).
 *   3. Runs the requested flows, in suite order (see SUITE).
 *   4. Finally — pass, fail or Ctrl+C — purges both numbers, then prints what
 *      the harness sees on each.
 *
 * Those /e2e-auth calls are its only state operations. It never runs the
 * emulator suite's seeder and never talks to the Auth emulator.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localDigits } from './accounts.mjs';
import { fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';
import {
  quietDeviceChrome,
  requireAppInstalled,
  requireMetro,
  resolveMaestro,
  reverseMetroPort,
  runMaestro,
} from './lab.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const LIVE_FLOWS_DIR = join(E2E_DIR, 'flows', 'live');

/** Registers the managed account; runs once, before any flow. */
const REGISTER_FLOW = '_register-managed';

/** The live-auth backend listens where the ordinary test backend does. */
const BACKEND_URL = 'http://127.0.0.1:3001';

/** Mailpit's HTTP API — registration's email code is our backend's, and stays local. */
const MAILPIT_URL = 'http://127.0.0.1:8025';

const METRO_URL = 'http://127.0.0.1:8081';

/**
 * Deliberately not exported: importing this module runs a live suite against
 * the project production uses.
 */
const LIVE = {
  /** The managed account: registered, signed into, reset twice and purged, each run. */
  managed: {
    phone: '+201234567891',
    code: '111111',
    email: 'markbotros0+e2e1@gmail.com',
    password: 'E2ePassw0rd!',
    newPassword: 'E2eNewPassw0rd!',
    newerPassword: 'E2eNewerPassw0rd!',
    firstName: 'Mona',
  },
  /** Deliberately never registered: drives the orphan guard. */
  absent: {
    phone: '+201234567892',
    code: '222222',
  },
};

/**
 * The suite, in the only order it works in.
 *
 * The managed account is registered once per run, so each flow starts from
 * whatever password the one before it left:
 *
 *   sign-in-sms             phone door; no password involved
 *   sign-in-email           needs the registration password (MANAGED_PASSWORD)
 *   sign-in-sms-no-account  the other number; the managed account is untouched
 *   reset-email             sets MANAGED_NEW_PASSWORD, then signs in with it
 *   reset-sms               sets MANAGED_NEWER_PASSWORD, then signs in with it
 *
 * Each reset sets a password the account cannot already have, or signing in
 * with it afterwards would prove nothing. A subset runs in this order too, and
 * every run registers afresh — so a flow starts from the same password whether
 * it runs alone or in the suite (a lone reset-sms resets from MANAGED_PASSWORD).
 */
const SUITE = ['sign-in-sms', 'sign-in-email', 'sign-in-sms-no-account', 'reset-email', 'reset-sms'];

/** Every flow gets the same values; which password a flow types is fixed by SUITE's order. */
const PARAMS = {
  // What a flow types: the country code is a separate, fixed control.
  MANAGED_PHONE: localDigits(LIVE.managed.phone),
  // What the harness steps look numbers up by.
  MANAGED_PHONE_E164: LIVE.managed.phone,
  MANAGED_CODE: LIVE.managed.code,
  MANAGED_EMAIL: LIVE.managed.email,
  MANAGED_PASSWORD: LIVE.managed.password,
  MANAGED_NEW_PASSWORD: LIVE.managed.newPassword,
  MANAGED_NEWER_PASSWORD: LIVE.managed.newerPassword,
  MANAGED_FIRST_NAME: LIVE.managed.firstName,
  ABSENT_PHONE: localDigits(LIVE.absent.phone),
  ABSENT_PHONE_E164: LIVE.absent.phone,
  ABSENT_CODE: LIVE.absent.code,
  BACKEND_URL,
  MAILPIT_URL,
};

function flowsToRun(requested) {
  for (const flow of [REGISTER_FLOW, ...SUITE]) {
    if (!existsSync(join(LIVE_FLOWS_DIR, `${flow}.yaml`))) fail(`flows/live/${flow}.yaml is missing.`);
  }
  if (requested.length === 0) return SUITE;

  const names = requested.map((name) => name.replace(/\.yaml$/, ''));
  const unknown = names.filter((name) => !SUITE.includes(name));
  if (unknown.length > 0) {
    fail(`No live flow named ${unknown.join(', ')}. Available: ${SUITE.join(', ')}`);
  }
  // Suite order, whatever order they were asked for in.
  return SUITE.filter((flow) => names.includes(flow));
}

/** One call to the harness. Throws only if the backend cannot be reached at all. */
async function harness(method, path, body) {
  const response = await fetch(`${BACKEND_URL}/e2e-auth${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let envelope = null;
  try {
    envelope = JSON.parse(text);
  } catch {
    // 204, or not JSON — `text` still says what came back.
  }
  return {
    ok: response.ok,
    status: response.status,
    text,
    data: envelope?.data ?? null,
    error: envelope?.error ?? null,
  };
}

/**
 * The backend has to be the live-auth profile. The ordinary test backend has
 * no /e2e-auth routes at all, so a read of the never-registered number — which
 * only ever reads — tells the two apart.
 */
async function requireLiveBackend() {
  const url = `${BACKEND_URL}/e2e-auth/account?phone=${encodeURIComponent(LIVE.absent.phone)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (response?.ok) return;

  const why = response
    ? `answered ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`
    : 'did not answer';
  fail(
    `The live-auth harness at ${url} ${why}.\n\n` +
      'This suite needs the backend in its live-auth profile (the plain test backend has no\n' +
      '/e2e-auth routes) and the live Metro:\n' +
      '  pnpm test:env\n' +
      '  pnpm --filter=@nanny-app/backend start:test:live-auth\n' +
      '  pnpm --filter @nanny-app/mobile e2e:metro:live',
  );
}

/**
 * Metro has to be the live one. A debug build takes its config from Metro, so
 * plain `e2e:metro` would quietly point the app's Auth back at the emulator —
 * the flows would then fail on codes the emulator never issued, and none of
 * them would be about the real project. The manifest Metro serves carries the
 * two values that differ; if it cannot be read this only warns, because the
 * backend and the flows would still fail loudly on a wrong Metro.
 */
async function requireLiveMetro() {
  const response = await fetch(`${METRO_URL}/`, {
    headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  const manifest = response?.ok ? await response.text().catch(() => '') : '';

  const emulatorHost = manifest.match(/"firebaseAuthEmulatorHost"\s*:\s*"([^"]*)"/);
  const verificationOff = manifest.match(/"firebaseAppVerificationDisabledForTesting"\s*:\s*(true|false)/);
  if (!emulatorHost || !verificationOff) {
    console.warn(
      "[live] Could not read the app's config from Metro's manifest, so cannot confirm it is\n" +
        '       the live one. It must have been started with:\n' +
        '         pnpm --filter @nanny-app/mobile e2e:metro:live',
    );
    return;
  }

  if (emulatorHost[1] !== '' || verificationOff[1] !== 'true') {
    fail(
      `Metro is serving the emulator config (Auth emulator "${emulatorHost[1]}", app ` +
        `verification disabled: ${verificationOff[1]}). Stop it and start the live one:\n` +
        '  pnpm --filter @nanny-app/mobile e2e:metro:live',
    );
  }
}

/**
 * Starts the run. On a refusal, stops *without* purging: the likeliest reason
 * is an account on a reserved number that this run did not create, and that
 * is exactly what must not be deleted automatically.
 */
async function beginRun() {
  let result;
  try {
    result = await harness('POST', '/begin', {});
  } catch (error) {
    return fail(`POST /e2e-auth/begin did not answer (${error.message}). Nothing was purged.`);
  }
  if (!result.ok) {
    fail(
      `POST /e2e-auth/begin refused (${result.status}): ${result.error ?? result.text}\n\n` +
        'Nothing was purged. See e2e/README.md, "Live-Firebase auth suite", before running again.',
    );
  }
  console.log(`[live] run begun at ${result.data?.beganAt ?? 'an unreported time'}`);
}

/** Returns a reserved number to "never registered". Logs, never throws: it runs in a `finally`. */
async function purge(phone) {
  try {
    const result = await harness('POST', '/purge', { phone });
    if (result.ok) return true;
    console.error(`[live] purge ${phone} → ${result.status} ${result.error ?? result.text}`);
  } catch (error) {
    console.error(`[live] purge ${phone} did not answer: ${error.message}`);
  }
  return false;
}

/** What the harness sees on each number now. False if anything is left behind or unreadable. */
async function reportFinalState() {
  let clean = true;
  for (const phone of [LIVE.managed.phone, LIVE.absent.phone]) {
    try {
      const result = await harness('GET', `/account?phone=${encodeURIComponent(phone)}`);
      if (!result.ok || !result.data) {
        console.error(`[live] ${phone}: GET /e2e-auth/account → ${result.status} ${result.text}`);
        clean = false;
        continue;
      }
      console.log(`[live] ${phone}: ${JSON.stringify(result.data)}`);
      if (result.data.firebaseExists || result.data.dbRowExists) {
        console.error(`[live] ${phone} still has an account — the next begin will refuse.`);
        clean = false;
      }
    } catch (error) {
      console.error(`[live] ${phone}: GET /e2e-auth/account did not answer: ${error.message}`);
      clean = false;
    }
  }
  return clean;
}

async function runStep(maestro, flow) {
  console.log(`\n[live] ── ${flow} ─────────────────────────────`);
  const passed = runMaestro(maestro, join(LIVE_FLOWS_DIR, `${flow}.yaml`), PARAMS);
  // spawnSync holds the event loop, so a Ctrl+C pressed during the flow is only
  // delivered now. One turn of the loop lets the SIGINT listener run before the
  // caller decides whether to start another flow.
  await new Promise((resolve) => setImmediate(resolve));
  return passed;
}

async function main() {
  // Arguments first: a typo should cost nothing, least of all a begun run.
  const flows = flowsToRun(process.argv.slice(2));

  const maestro = resolveMaestro();
  const adb = resolveAdb();
  const device = requireBootedDevice(adb);
  if (!isBooted(adb, device)) {
    fail(`${device} is attached but still booting. Wait for the home screen and try again.`);
  }
  requireAppInstalled(adb, device);
  await requireLiveBackend();
  await requireMetro('e2e:metro:live');
  await requireLiveMetro();
  reverseMetroPort(adb, device);
  quietDeviceChrome(adb, device);

  console.log(`[live] device ${device}, maestro ${maestro}`);
  console.log(`[live] flows: ${flows.join(', ')}`);

  await beginRun();

  // From here every way out goes through the purge below — `fail()` exits the
  // process, so nothing inside the try may call it. Ctrl+C would normally kill
  // the process on the spot and leave the managed account behind, after which
  // the next begin refuses until someone deletes it by hand; instead the first
  // one stops the suite after the current flow and the second abandons the
  // purge.
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) {
      console.error('\n[live] Abandoning the purge. See e2e/README.md before the next run.');
      process.exit(130);
    }
    interrupted = true;
    console.error('\n[live] Interrupted: no further flows. Purging both numbers (Ctrl+C again to skip).');
  });

  const failed = [];
  let registered = false;
  let ran = 0;
  try {
    registered = await runStep(maestro, REGISTER_FLOW);
    if (registered) {
      for (const flow of flows) {
        if (interrupted) break;
        ran += 1;
        if (!(await runStep(maestro, flow))) failed.push(flow);
      }
    }
  } finally {
    console.log('\n[live] purging both reserved numbers…');
    let purged = true;
    for (const phone of [LIVE.managed.phone, LIVE.absent.phone]) {
      if (!(await purge(phone))) purged = false;
    }
    const clean = await reportFinalState();
    if (!purged || !clean) process.exitCode = 1;
  }

  if (interrupted) {
    console.error(`\n[live] Interrupted after ${ran} of ${flows.length} flows.`);
    process.exitCode = 130;
    return;
  }
  if (!registered) {
    console.error('\n[live] Registering the managed account failed, so no flow ran.');
    process.exitCode = 1;
    return;
  }
  console.log(`\n[live] ${flows.length - failed.length}/${flows.length} flows passed.`);
  if (failed.length > 0) {
    console.error(`[live] failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

await main();
