/**
 * The device-lab plumbing both runners share: finding Maestro, checking the app
 * and Metro are there, quieting the device, and invoking one flow.
 *
 * `run.mjs` (the emulator suite) and `live.mjs` (the live-Firebase auth suite)
 * differ in what they seed and what they talk to, not in how they drive the
 * device — so that part lives here, once, and a fix to device prep reaches
 * both. Nothing in this module seeds, wipes or touches any account.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_ID, fail } from './android.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Locates the Maestro CLI.
 *
 * Not assumed to be on PATH: adding it there means editing the user's global
 * PATH, and `setx` truncates it at 1024 characters — a genuinely destructive
 * side effect for a test runner to have. The default install location is
 * checked instead, and MAESTRO_BIN overrides.
 */
export function resolveMaestro() {
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
export function requireAppInstalled(adb, device) {
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

/**
 * Metro serves the JS *and* the config block that points the app at the local
 * stack. `metroScript` is the package script that starts the right one —
 * `e2e:metro` for the emulator suite, `e2e:metro:live` for the live one.
 */
export async function requireMetro(metroScript = 'e2e:metro') {
  const response = await fetch('http://127.0.0.1:8081/status').catch(() => null);
  if (!response?.ok) {
    fail(
      'No Metro bundler on :8081. A debug build loads its JS from there:\n' +
        `  pnpm --filter @nanny-app/mobile ${metroScript}`,
    );
  }

  await warmMetro(metroScript);
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
async function warmMetro(metroScript) {
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
      `  pnpm --filter @nanny-app/mobile ${metroScript}`,
  );
}

/**
 * The two app-config values that tell the suites' Metros apart, as Metro is
 * serving them right now — or null if the manifest cannot be read.
 *
 * A debug build takes its config from Metro, not from the APK, so this is what
 * the app on the device will actually run with. `e2e:metro` sets the Auth
 * emulator host; `e2e:metro:live` leaves it empty and disables app
 * verification (see emulator-env.mjs).
 */
async function readMetroAuthConfig() {
  const response = await fetch('http://127.0.0.1:8081/', {
    headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  const manifest = response?.ok ? await response.text().catch(() => '') : '';

  const emulatorHost = manifest.match(/"firebaseAuthEmulatorHost"\s*:\s*"([^"]*)"/);
  const verificationOff = manifest.match(
    /"firebaseAppVerificationDisabledForTesting"\s*:\s*(true|false)/,
  );
  if (!emulatorHost || !verificationOff) return null;

  return {
    authEmulatorHost: emulatorHost[1],
    appVerificationDisabled: verificationOff[1] === 'true',
  };
}

/**
 * Refuses a Metro serving the other suite's config. `suite` is `'emulator'`
 * (run.mjs) or `'live'` (live.mjs).
 *
 *   - The emulator suite seeds and signs in against the Auth emulator. Under a
 *     live Metro the app would sign in to the real project — the one
 *     production uses — with the lab's seeded addresses, so this refusal is
 *     strict: an unreadable manifest refuses too, because "could not confirm
 *     it is the emulator" is not good enough to run against.
 *   - The live suite under an emulator Metro would only fail — on codes the
 *     emulator never issued — and the backend and flows would say so loudly,
 *     so an unreadable manifest there only warns.
 */
export async function requireMetroFor(suite) {
  const config = await readMetroAuthConfig();
  const liveScript = '  pnpm --filter @nanny-app/mobile e2e:metro:live';
  const emulatorScript = '  pnpm --filter @nanny-app/mobile e2e:metro';

  if (suite === 'emulator') {
    if (!config) {
      fail(
        "Could not read the app's config from Metro's manifest, so cannot confirm Auth points at\n" +
          'the emulator — and the other possibility is the real project. Restart Metro with:\n' +
          emulatorScript,
      );
    }
    if (config.authEmulatorHost === '') {
      fail(
        'Metro is serving the live-Firebase config (no Auth emulator host), so the app would sign\n' +
          'in to the real project. Stop it and start the emulator one:\n' +
          emulatorScript,
      );
    }
    return;
  }

  if (!config) {
    console.warn(
      "[live] Could not read the app's config from Metro's manifest, so cannot confirm it is\n" +
        '       the live one. It must have been started with:\n' +
        `       ${liveScript.trim()}`,
    );
    return;
  }
  if (config.authEmulatorHost !== '' || !config.appVerificationDisabled) {
    fail(
      `Metro is serving the emulator config (Auth emulator "${config.authEmulatorHost}", app ` +
        `verification disabled: ${config.appVerificationDisabled}). Stop it and start the live one:\n` +
        liveScript,
    );
  }
}

/**
 * Maps :8081 inside the emulator to Metro on the host.
 *
 * Without this the dev-client link would have to name `10.0.2.2`, which works
 * but bakes the emulator's host alias into every flow. `adb reverse` keeps the
 * flows saying `localhost`, so they read the same as they would on a physical
 * device over USB.
 */
export function reverseMetroPort(adb, device) {
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
export function quietDeviceChrome(adb, device) {
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

  // Give the device a GPS fix, so registration's "Use my current location"
  // (and the auto-seed on step 2's mount) has coordinates to read — Cairo, the
  // region the seed data sits in. `geo fix` takes longitude first, then
  // latitude. Without this, getCurrentPositionAsync returns nothing on a fresh
  // AVD and the location step can never be completed.
  spawnSync(adb, ['-s', device, 'emu', 'geo', 'fix', '31.2357', '30.0444']);

  // Turn the emulated Wi-Fi off, or the app cannot reach the host at all. The
  // API 35 google_apis image brings up a mac80211_hwsim `wlan0` on the *same*
  // 10.0.2.0/24 subnet as the SLIRP NAT `eth0`, with no default route — so
  // packets to the host alias `10.0.2.2` (where the backend, the Auth emulator
  // and Paymob all listen) can leave via wlan0, which has no path to the host,
  // and every request dies as "Network is unreachable" / `auth/unknown`. eth0
  // is the only interface that reaches 10.0.2.2, so wlan0 has to be out of the
  // way. A cold boot re-enables it, which is why this runs before every suite.
  spawnSync(adb, ['-s', device, 'shell', 'svc', 'wifi', 'disable']);
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

/**
 * Runs one flow file with `params` as its `-e` values, and says whether it
 * passed. Never exits the process itself — a caller with cleanup to do (the
 * live suite's purge) has to get control back whatever happens here.
 */
export function runMaestro(maestro, flowPath, params) {
  const result = spawnSync(
    maestro,
    [
      'test',
      flowPath,
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
