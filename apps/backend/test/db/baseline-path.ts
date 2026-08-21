import path from 'node:path';

/**
 * Where global-setup caches the seeded app_settings rows for reset.ts to
 * restore after each truncate.
 *
 * It lives in its own module so a test-time import does not drag in
 * global-setup.ts, which pulls in child_process and is meant to run exactly
 * once, in Jest's own process.
 */
export const BASELINE_SETTINGS_PATH = path.join(__dirname, '..', '.baseline-settings.json');
