/**
 * The checks `start:test:paymob-sandbox` runs before it will start, kept apart
 * from the loader so they can be unit tested without starting anything.
 *
 * The sandbox profile is the only test profile that talks to Paymob itself.
 * Paymob's keys say which mode they are for (`egy_sk_test_…` and
 * `egy_sk_live_…`), so a live key is refused by its shape. That is the whole
 * defence against a real charge, so it must never fail open.
 */

/** The values the profile takes from `.env.paymob-sandbox.local`. */
export const PAYMOB_SANDBOX_KEYS = [
  'PAYMOB_SECRET_KEY',
  'PAYMOB_PUBLIC_KEY',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_PAYMENT_METHOD_IDS',
  'PUBLIC_API_URL',
] as const;

export type PaymobSandboxEnv = Partial<Record<(typeof PAYMOB_SANDBOX_KEYS)[number], string>>;

/** Everything wrong with `env`, as messages that name no value. Empty means it may start. */
export function paymobSandboxProblems(env: PaymobSandboxEnv): string[] {
  const problems: string[] = [];
  const secret = env.PAYMOB_SECRET_KEY?.trim() ?? '';
  const publicKey = env.PAYMOB_PUBLIC_KEY?.trim() ?? '';

  for (const key of PAYMOB_SANDBOX_KEYS) {
    if (!env[key]?.trim()) problems.push(`${key} is not set.`);
  }

  // Checked separately from the prefix test, so that a live key is named as
  // live rather than as merely malformed.
  if (/_live_/i.test(secret) || /_live_/i.test(publicKey)) {
    problems.push('A LIVE Paymob key was supplied. This profile only ever takes TEST keys.');
  }
  if (secret && !/^[a-z]{3}_sk_test_/.test(secret)) {
    problems.push('PAYMOB_SECRET_KEY is not a test secret key (expected egy_sk_test_…).');
  }
  if (publicKey && !/^[a-z]{3}_pk_test_/.test(publicKey)) {
    problems.push('PAYMOB_PUBLIC_KEY is not a test public key (expected egy_pk_test_…).');
  }

  const ids = env.PAYMOB_PAYMENT_METHOD_IDS?.trim() ?? '';
  if (ids && !/^\d+(\s*,\s*\d+)*$/.test(ids)) {
    problems.push('PAYMOB_PAYMENT_METHOD_IDS must be integration ids, comma separated.');
  }

  const publicApiUrl = env.PUBLIC_API_URL?.trim() ?? '';
  if (publicApiUrl) {
    let protocol = '';
    try {
      protocol = new URL(publicApiUrl).protocol;
    } catch {
      problems.push('PUBLIC_API_URL is not a URL.');
    }
    // Paymob has to reach it from the internet to deliver the webhook. A
    // loopback or http URL would pass every check here and then never be called.
    if (protocol && protocol !== 'https:') {
      problems.push('PUBLIC_API_URL must be the https tunnel URL Paymob can reach.');
    }
  }

  return problems;
}
