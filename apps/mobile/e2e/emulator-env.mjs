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
  // Points the checkout WebView at the Paymob fake instead of Paymob. Empty in
  // every real build — see apps/mobile/src/lib/paymobCheckout.ts.
  PAYMOB_CHECKOUT_ORIGIN: 'http://10.0.2.2:4010',
};
