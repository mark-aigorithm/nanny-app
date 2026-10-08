import {
  buildTransactionHmacPlaintext,
  computePaymobHmacHex,
  verifyPaymobTransactionHmac,
} from '@backend/lib/paymob/hmac';
import { normalizeMerchantPaymentReference } from '@backend/lib/paymob/parse-webhook';
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

  it("concatenates the fields in Paymob's documented order, booleans as 'true'/'false'", () => {
    expect(buildTransactionHmacPlaintext(sample)).toBe(
      '1000' +
        '2024-01-01T12:00:00.000Z' +
        'EGP' +
        'false' + // error_occured
        'false' + // has_parent_transaction
        '123' +
        '456' +
        'true' + // is_3d_secure
        'false' + // is_auth
        'false' + // is_capture
        'false' + // is_refunded
        'false' + // is_standalone_payment
        'false' + // is_voided
        '789' +
        '100' +
        'false' + // pending
        '1111' +
        'Visa' +
        'card' +
        'true', // success
    );
  });

  it('lower-cases the PAN and source type but keeps the sub-type as sent', () => {
    const plain = buildTransactionHmacPlaintext({
      ...sample,
      source_data: { pan: 'ABCD', sub_type: 'MasterCard', type: 'CARD' },
    });
    expect(plain).toContain('abcdMasterCardcard');
  });

  it('treats a missing source_data (e.g. a wallet payment) as empty strings', () => {
    const { source_data: _omit, ...withoutSource } = sample;
    const plain = buildTransactionHmacPlaintext(withoutSource);
    // pending=false immediately followed by success=true — nothing in between.
    expect(plain.endsWith('100falsetrue')).toBe(true);
  });

  it('treats missing fields inside source_data as empty strings', () => {
    const plain = buildTransactionHmacPlaintext({ ...sample, source_data: {} });
    expect(plain.endsWith('100falsetrue')).toBe(true);
  });

  it('changes the signature when the amount is tampered with', () => {
    const secret = 'unit_test_hmac';
    const hex = computePaymobHmacHex(buildTransactionHmacPlaintext(sample), secret);
    const tampered = buildTransactionHmacPlaintext({ ...sample, amount_cents: 100 });
    expect(verifyPaymobTransactionHmac(tampered, hex, secret)).toBe(false);
  });

  it('changes the signature when a failed transaction is flipped to success', () => {
    const secret = 'unit_test_hmac';
    const failed = { ...sample, success: false };
    const hex = computePaymobHmacHex(buildTransactionHmacPlaintext(failed), secret);
    expect(verifyPaymobTransactionHmac(buildTransactionHmacPlaintext(sample), hex, secret)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    const hex = computePaymobHmacHex(plain, 'someone_elses_secret');
    expect(verifyPaymobTransactionHmac(plain, hex, 'unit_test_hmac')).toBe(false);
  });

  it('accepts an upper-cased signature with surrounding whitespace', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    const hex = computePaymobHmacHex(plain, 'unit_test_hmac');
    expect(verifyPaymobTransactionHmac(plain, `  ${hex.toUpperCase()}\n`, 'unit_test_hmac')).toBe(true);
  });

  it('rejects a same-length signature that differs by one character', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    const hex = computePaymobHmacHex(plain, 'unit_test_hmac');
    const flipped = (hex[0] === 'a' ? 'b' : 'a') + hex.slice(1);
    expect(verifyPaymobTransactionHmac(plain, flipped, 'unit_test_hmac')).toBe(false);
  });

  it('rejects an empty signature', () => {
    const plain = buildTransactionHmacPlaintext(sample);
    expect(verifyPaymobTransactionHmac(plain, '', 'unit_test_hmac')).toBe(false);
  });

  it('produces a 128-character lower-case hex SHA-512 digest', () => {
    expect(computePaymobHmacHex('x', 'k')).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('Paymob merchant payment reference', () => {
  it('normalizes retry suffixes back to the payment id', () => {
    expect(normalizeMerchantPaymentReference('clxyz123')).toBe('clxyz123');
    expect(normalizeMerchantPaymentReference('clxyz123-r2')).toBe('clxyz123');
  });
});
