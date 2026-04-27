import {
  buildTransactionHmacPlaintext,
  computePaymobHmacHex,
  verifyPaymobTransactionHmac,
} from '@backend/lib/paymob/hmac';
import type { PaymobTransactionHmacPayload } from '@backend/lib/paymob/types';

describe('Paymob transaction HMAC', () => {
  const sample: PaymobTransactionHmacPayload = {
    amount_cents: 1000,
    created_at: '2024-01-01T12:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 123,
    integration_id: 456,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: false,
    is_voided: false,
    order: { id: 789 },
    owner: 100,
    pending: false,
    success: true,
    source_data: {
      pan: '1111',
      sub_type: 'Visa',
      type: 'card',
    },
  };

  it('builds a deterministic plaintext string', () => {
    const a = buildTransactionHmacPlaintext(sample);
    const b = buildTransactionHmacPlaintext(sample);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it('verifies a correctly signed payload', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    const secret = 'unit_test_hmac';
    const hex = computePaymobHmacHex(plain, secret);
    expect(verifyPaymobTransactionHmac(plain, hex, secret)).toBe(true);
  });

  it('rejects tampered HMAC', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    expect(verifyPaymobTransactionHmac(plain, 'abc123', 'unit_test_hmac')).toBe(false);
  });
});
