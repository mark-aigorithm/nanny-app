/**
 * Types for checkout-driver.mjs. `page` is a Playwright Page. It is typed
 * loosely because this folder has no node_modules of its own, and each caller
 * brings its own Playwright package.
 */
export declare function payCheckout(
  page: object,
  options: { origin: string; publicKey: string; clientSecret: string; card?: string; timeoutMs?: number },
): Promise<{ success: boolean; returnUrl: string }>;
