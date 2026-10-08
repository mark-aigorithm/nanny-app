import { paymobSandboxProblems, type PaymobSandboxEnv } from '../../test/paymob-sandbox-guard';

const VALID: PaymobSandboxEnv = {
  PAYMOB_SECRET_KEY: 'egy_sk_test_abc123',
  PAYMOB_PUBLIC_KEY: 'egy_pk_test_def456',
  PAYMOB_HMAC_SECRET: 'hmac',
  PAYMOB_PAYMENT_METHOD_IDS: '12345, 67890',
  PUBLIC_API_URL: 'https://quiet-river.trycloudflare.com',
};

describe('paymobSandboxProblems', () => {
  it('accepts a complete set of test-mode values', () => {
    expect(paymobSandboxProblems(VALID)).toEqual([]);
  });

  it('refuses a live secret key and names it as live', () => {
    const problems = paymobSandboxProblems({ ...VALID, PAYMOB_SECRET_KEY: 'egy_sk_live_abc123' });

    expect(problems).toContainEqual(expect.stringMatching(/LIVE/));
  });

  it('refuses a live public key', () => {
    const problems = paymobSandboxProblems({ ...VALID, PAYMOB_PUBLIC_KEY: 'egy_pk_live_def456' });

    expect(problems).toContainEqual(expect.stringMatching(/LIVE/));
  });

  it('refuses keys that are not shaped like Paymob test keys', () => {
    const problems = paymobSandboxProblems({
      ...VALID,
      PAYMOB_SECRET_KEY: 'test_secret_key',
      PAYMOB_PUBLIC_KEY: 'test_public_key',
    });

    expect(problems).toHaveLength(2);
  });

  it('names every missing value', () => {
    const problems = paymobSandboxProblems({});

    expect(problems).toHaveLength(5);
  });

  it('refuses a webhook URL Paymob cannot reach', () => {
    expect(paymobSandboxProblems({ ...VALID, PUBLIC_API_URL: 'http://127.0.0.1:3002' })).toContainEqual(
      expect.stringMatching(/https/),
    );
  });

  it('refuses integration ids that are not numbers', () => {
    expect(paymobSandboxProblems({ ...VALID, PAYMOB_PAYMENT_METHOD_IDS: 'card' })).toHaveLength(1);
  });

  it('never echoes a value back', () => {
    const problems = paymobSandboxProblems({ ...VALID, PAYMOB_SECRET_KEY: 'egy_sk_live_SECRETVALUE' });

    expect(problems.join(' ')).not.toContain('SECRETVALUE');
  });
});
