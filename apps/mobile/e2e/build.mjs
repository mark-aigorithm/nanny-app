#!/usr/bin/env node
/**
 * Builds and installs the debug APK the lab drives.
 *
 * This is `expo run:android` minus one thing: the ABI. Expo derives it from the
 * connected device and the emulator over-reports (see `EMULATOR_ABI`), so the
 * Gradle invocation is made here instead, with the ABI pinned.
 *
 * Debug, deliberately: JS is loaded from Metro, so a flow can be re-run against
 * edited code without rebuilding, cleartext HTTP to the local stack is allowed,
 * and nothing needs signing — no EAS, no keystore, no cloud.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMULATOR_ABI, fail, isBooted, requireBootedDevice, resolveAdb } from './android.mjs';
import { EMULATOR_ENV } from './emulator-env.mjs';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const ANDROID_DIR = resolve(E2E_DIR, '..', 'android');
const APK = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const adb = resolveAdb();
const device = requireBootedDevice(adb);
if (!isBooted(adb, device)) {
  fail(`${device} is attached but still booting. Wait for the home screen and try again.`);
}

console.log(`[e2e] building for ${EMULATOR_ABI} …`);

const gradle = spawnSync(
  join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'),
  [
    'app:assembleDebug',
    '-x',
    'lint',
    '-x',
    'test',
    '--configure-on-demand',
    '--build-cache',
    `-PreactNativeArchitectures=${EMULATOR_ABI}`,
  ],
  {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...EMULATOR_ENV },
  },
);

if (gradle.status !== 0) fail('Gradle build failed — see the output above.');
if (!existsSync(APK)) fail(`Gradle reported success but there is no APK at ${APK}.`);

console.log(`[e2e] installing on ${device} …`);
const install = spawnSync(adb, ['-s', device, 'install', '-r', APK], { stdio: 'inherit' });
if (install.status !== 0) fail('adb install failed — see the output above.');

console.log('\n[e2e] installed. Start Metro, then run the flows:\n  pnpm e2e:metro\n');
