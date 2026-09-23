#!/usr/bin/env node
/**
 * Runs a command with the emulator environment applied.
 *
 * Used for Metro (`e2e:metro`); the APK build applies the same environment
 * itself. See emulator-env.mjs for what the values mean.
 *
 *   node e2e/with-emulator-env.mjs expo start --clear
 *   node e2e/with-emulator-env.mjs --live-auth expo start --clear
 *
 * `--live-auth` is the live-Firebase suite's Metro (`e2e:metro:live`): Auth on
 * the real project, Storage and everything else still local. The APK is the
 * same one either way — a debug build takes this config from Metro, not from
 * the build — so switching suites means restarting Metro, not rebuilding.
 */
import { spawnSync } from 'node:child_process';

import { AUTH_EMULATOR_KEY, EMULATOR_ENV, LIVE_AUTH_ENV } from './emulator-env.mjs';

const argv = process.argv.slice(2);
const liveAuth = argv[0] === '--live-auth';
const [command, ...args] = liveAuth ? argv.slice(1) : argv;

if (!command) {
  console.error('Usage: node e2e/with-emulator-env.mjs [--live-auth] <command> [args…]');
  process.exit(1);
}

const env = { ...process.env, ...(liveAuth ? LIVE_AUTH_ENV : EMULATOR_ENV) };

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
