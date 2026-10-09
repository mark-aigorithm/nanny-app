#!/usr/bin/env node
/**
 * Runs a command with the emulator environment applied.
 *
 * Used for Metro (`e2e:metro`); the APK build applies the same environment
 * itself. See emulator-env.mjs for what the values mean.
 *
 *   node e2e/with-emulator-env.mjs expo start --clear
 *   node e2e/with-emulator-env.mjs --live-auth expo start --clear
 *   node e2e/with-emulator-env.mjs --paymob-fake expo start --clear
 *
 * `--live-auth` is the live-Firebase suite's Metro (`e2e:metro:live`): Auth on
 * the real project, Storage and everything else still local. The APK is the
 * same one either way — a debug build takes this config from Metro, not from
 * the build — so switching suites means restarting Metro, not rebuilding.
 *
 * With no variant, checkout is Paymob's real TEST-mode page and the API is the
 * sandbox backend (PAYMOB_MODE=sandbox, the default). `--paymob-fake` is
 * PAYMOB_MODE=fake's Metro (`e2e:metro:paymob-fake`): the local Paymob fake,
 * and the API on the fake's backend.
 */
import { spawnSync } from 'node:child_process';

import { AUTH_EMULATOR_KEY, EMULATOR_ENV, LIVE_AUTH_ENV, PAYMOB_FAKE_ENV } from './emulator-env.mjs';

const VARIANTS = { '--live-auth': LIVE_AUTH_ENV, '--paymob-fake': PAYMOB_FAKE_ENV };

const argv = process.argv.slice(2);
const variant = VARIANTS[argv[0]];
const liveAuth = argv[0] === '--live-auth';
const [command, ...args] = variant ? argv.slice(1) : argv;

if (!command) {
  console.error('Usage: node e2e/with-emulator-env.mjs [--live-auth | --paymob-fake] <command> [args…]');
  process.exit(1);
}

const env = { ...process.env, ...(variant ?? EMULATOR_ENV) };

if (liveAuth) {
  // Dropped even if the calling shell exported it: one stray variable would
  // point the "live" suite back at the emulator. Compared case-insensitively
  // because Windows environment names are.
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === AUTH_EMULATOR_KEY) delete env[key];
  }
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
});

process.exit(result.status ?? 1);
