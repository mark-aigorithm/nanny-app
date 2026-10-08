/** Types for mode.mjs, which the TypeScript suites (admin E2E) import. */
export type PaymobMode = 'fake' | 'sandbox';

export type PaymobProfile = {
  mode: PaymobMode;
  backendUrl: string;
  checkoutOrigin: string;
  emulatorApiBaseUrl: string;
  emulatorCheckoutOrigin: string;
  backendScript: string;
  metroScript: string;
};

export type TestCard = {
  number: string;
  expiry: string;
  cvv: string;
  name: string;
  outcome: 'approved' | 'declined';
  source: string;
};

export declare const CHECKOUT: {
  labels: Record<'cardNumber' | 'expiry' | 'cvv' | 'name' | 'pay' | 'threeDsTitle' | 'threeDsSubmit', string>;
  cards: Record<string, TestCard>;
};
export declare const PAYMOB_PROFILES: Record<PaymobMode, PaymobProfile>;
export declare function resolvePaymobMode(argv?: string[], env?: Record<string, string | undefined>): PaymobProfile;
export declare function withoutPaymobFlag(argv: string[]): string[];
export declare function checkoutUrl(origin: string, publicKey: string, clientSecret: string): string;
