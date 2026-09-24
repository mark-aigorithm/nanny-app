/**
 * The environment an Android emulator needs to reach the local test stack.
 *
 * `10.0.2.2` is the emulator's alias for the host machine's loopback — inside
 * the VM, `127.0.0.1` is the emulator itself, so every one of these would
 * otherwise resolve to nothing.
 *
 * These reach the app through `app.config.ts`'s `extra` block. In a debug build
 * that block is served by Metro, so it is **Metro's** environment that decides
 * what the running app sees: change a value here and restart Metro, not just
 * the app.
 */
export const EMULATOR_ENV = {
  API_BASE_URL: 'http://10.0.2.2:3001',
  FIREBASE_AUTH_EMULATOR_HOST: '10.0.2.2:9099',
  // Points native Storage (lib/storage.ts) at the local Storage emulator so
  // registration (nanny ID/avatar) and marketplace listing uploads work in E2E.
  // Also the flag the photo-picker affordance keys off (lib/e2eImage.ts).
  FIREBASE_STORAGE_EMULATOR_HOST: '10.0.2.2:9199',
  // Points the checkout WebView at the Paymob fake instead of Paymob. Empty in
  // every real build — see apps/mobile/src/lib/paymobCheckout.ts.
  PAYMOB_CHECKOUT_ORIGIN: 'http://10.0.2.2:4010',
};

/** The one key the live variant must never carry — see LIVE_AUTH_ENV. */
export const AUTH_EMULATOR_KEY = 'FIREBASE_AUTH_EMULATOR_HOST';

const { [AUTH_EMULATOR_KEY]: _authEmulatorHost, ...STILL_LOCAL } = EMULATOR_ENV;

/**
 * The live-Firebase auth suite's variant (`e2e:metro:live`, driven by
 * `e2e/live.mjs`): Auth talks to the real project, everything else stays local.
 *
 *   - No FIREBASE_AUTH_EMULATOR_HOST, so lib/firebase.ts leaves native Auth on
 *     the project google-services.json names — the one production uses.
 *   - Storage stays on the emulator. That keeps the photo pickers' E2E
 *     placeholder on (lib/e2eImage keys off this host), and it keeps any upload
 *     a flow makes out of the production bucket.
 *   - App verification is disabled for testing, because an emulator driven by
 *     Maestro cannot pass Play Integrity or a reCAPTCHA page. Firebase honours
 *     this only for the console's fictional test numbers — see lib/firebase.ts.
 */
export const LIVE_AUTH_ENV = {
  ...STILL_LOCAL,
  FIREBASE_APP_VERIFICATION_DISABLED_FOR_TESTING: 'true',
};
