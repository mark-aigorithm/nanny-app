#!/usr/bin/env node
/**
 * Runs a command with the emulator environment applied.
 *
 * Used for Metro (`e2e:metro`); the APK build applies the same environment
 * itself. See emulator-env.mjs for what the values mean.
 *
 *   node e2e/with-emulator-env.mjs expo start --clear
 */
import { spawnSync } from 'node:child_process';

import { EMULATOR_ENV } from './emulator-env.mjs';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node e2e/with-emulator-env.mjs <command> [args…]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...EMULATOR_ENV },
});

process.exit(result.status ?? 1);
