/**
 * Shared Android plumbing for the E2E scripts: finding the SDK tools and the
 * one device the lab drives.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const APP_ID = 'com.nannyapp.mobile';

/**
 * The only ABI the lab builds.
 *
 * `expo run:android` picks ABIs from the device's `ro.product.cpu.abilist`, and
 * the API 35 emulator image advertises `arm64-v8a` alongside `x86_64` because
 * it can translate arm binaries. That makes Expo build a second native slice
 * the emulator will never load — one that also fails outright on Windows
 * (`ninja: error: manifest 'build.ninja' still dirty after 100 tries`, from the
 * very long paths pnpm's store produces). Building the ABI the emulator
 * actually runs is both the fix and roughly half the work.
 */
export const EMULATOR_ABI = 'x86_64';

export function fail(message) {
  console.error(`\n[e2e] ${message}\n`);
  process.exit(1);
}

export function resolveAdb() {
  const sdk = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  if (!sdk) fail('ANDROID_HOME is not set, so adb cannot be located.');
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (!existsSync(adb)) fail(`No adb at ${adb}. Is the Android SDK installed?`);
  return adb;
}

/** The one booted device to drive, or an explanation of what to start. */
export function requireBootedDevice(adb) {
  const listed = execFileSync(adb, ['devices'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split('\t')[0]);

  if (listed.length === 0) {
    fail(
      'No booted Android device. Start the emulator first:\n' +
        '  emulator -avd nanny-e2e -gpu host',
    );
  }
  if (listed.length > 1) {
    // Maestro would pick one itself, which makes "it passed" ambiguous about where.
    fail(`More than one device is connected (${listed.join(', ')}). Leave exactly one running.`);
  }

  return listed[0];
}

/** True once the system has finished booting — `adb devices` reports a device well before this. */
export function isBooted(adb, device) {
  const result = spawnSync(adb, ['-s', device, 'shell', 'getprop', 'sys.boot_completed'], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  return result.stdout?.trim() === '1';
}
