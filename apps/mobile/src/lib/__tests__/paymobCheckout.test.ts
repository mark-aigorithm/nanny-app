/**
 * The checkout origin is the one place a misconfiguration would send real
 * customers' card details somewhere other than Paymob, so the fallback is
 * pinned here: `paymobCheckoutOrigin` is empty in every real build, and empty
 * must mean Paymob — not an empty host.
 */
const mockExtra: Record<string, unknown> = {};

// A getter, not a plain value: jest hoists this factory above `mockExtra`'s
// initialiser, so reading it eagerly would capture `undefined` and every case
// would silently fall back to the default origin — passing for the wrong reason.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

import { buildPaymobCheckoutUrl } from '@mobile/lib/paymobCheckout';

describe('buildPaymobCheckoutUrl', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockExtra)) delete mockExtra[key];
  });

  it('points at Paymob when nothing is configured', () => {
    expect(buildPaymobCheckoutUrl('pk_live', 'cs_live')).toBe(
      'https://accept.paymob.com/unifiedcheckout/?publicKey=pk_live&clientSecret=cs_live',
    );
  });

  it('points at Paymob when the override is the empty string a real build ships', () => {
    mockExtra['paymobCheckoutOrigin'] = '';

    expect(buildPaymobCheckoutUrl('pk_live', 'cs_live')).toContain('https://accept.paymob.com/');
  });

  it('uses the configured origin for end-to-end runs', () => {
    // What an Android emulator uses to reach the Paymob fake on the host.
    mockExtra['paymobCheckoutOrigin'] = 'http://10.0.2.2:4010';

    expect(buildPaymobCheckoutUrl('test_public_key', 'cs_test_1')).toBe(
      'http://10.0.2.2:4010/unifiedcheckout/?publicKey=test_public_key&clientSecret=cs_test_1',
    );
  });

  it('tolerates a trailing slash on the configured origin', () => {
    mockExtra['paymobCheckoutOrigin'] = 'http://10.0.2.2:4010/';

    expect(buildPaymobCheckoutUrl('pk', 'cs')).toContain('http://10.0.2.2:4010/unifiedcheckout/?');
  });
});
