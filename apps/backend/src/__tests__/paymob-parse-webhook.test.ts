import {
  coerceTransactionHmacPayload,
  extractMerchantPaymentId,
  extractPaymobTransactionObject,
  normalizeMerchantPaymentReference,
  transactionFailed,
  transactionSuccess,
} from '@backend/lib/paymob/parse-webhook';

/** A Paymob transaction callback object, as delivered under `obj`. */
function txn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 991,
    amount_cents: 31_800,
    integration_id: 1,
    owner: 100,
    created_at: '2026-10-01T10:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    pending: false,
    success: true,
    order: { id: 777 },
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    ...overrides,
  };
}

describe('extractPaymobTransactionObject', () => {
  it('unwraps the classic { type: "TRANSACTION", obj } envelope', () => {
    const obj = txn();
    expect(extractPaymobTransactionObject({ type: 'TRANSACTION', obj })).toBe(obj);
  });

  it('passes a raw transaction object through unchanged', () => {
    const raw = txn();
    expect(extractPaymobTransactionObject(raw)).toBe(raw);
  });

  it('refuses an envelope of another type (e.g. TOKEN) — it carries no transaction order', () => {
    expect(extractPaymobTransactionObject({ type: 'TOKEN', obj: { token: 'x' } })).toBeNull();
  });

  it('refuses a TRANSACTION envelope with no obj', () => {
    expect(extractPaymobTransactionObject({ type: 'TRANSACTION' })).toBeNull();
  });

  it('refuses a body that is not an object at all', () => {
    expect(extractPaymobTransactionObject(null)).toBeNull();
    expect(extractPaymobTransactionObject('hello')).toBeNull();
    expect(extractPaymobTransactionObject(42)).toBeNull();
  });

  it('refuses a transaction whose order has no id', () => {
    expect(extractPaymobTransactionObject({ id: 1, order: {} })).toBeNull();
    expect(extractPaymobTransactionObject({ id: 1, order: null })).toBeNull();
  });
});

describe('coerceTransactionHmacPayload', () => {
  it('keeps exactly the HMAC-signed fields and only the order id', () => {
    const payload = coerceTransactionHmacPayload(
      txn({ order: { id: 777, merchant_order_id: '8' }, extras: { payment_id: '8' }, special_reference: '8' }),
    );

    expect(payload).toEqual({
      amount_cents: 31_800,
      created_at: '2026-10-01T10:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 991,
      integration_id: 1,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 777 },
      owner: 100,
      pending: false,
      success: true,
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    });
  });
});

describe('transactionSuccess / transactionFailed', () => {
  it.each([
    [{ success: true, pending: false }, true, false],
    [{ success: false, pending: false }, false, true],
    // Still pending at the issuer — neither terminal state yet.
    [{ success: true, pending: true }, false, false],
    [{ success: false, pending: true }, false, false],
    // Missing flags are never read as a terminal state.
    [{ success: undefined, pending: undefined }, false, false],
    // Truthy-but-not-boolean values (a string "true") are not trusted.
    [{ success: 'true', pending: 'false' }, false, false],
  ])('%j → success=%s, failed=%s', (flags, success, failed) => {
    const t = txn(flags);
    expect(transactionSuccess(t)).toBe(success);
    expect(transactionFailed(t)).toBe(failed);
  });
});

describe('normalizeMerchantPaymentReference', () => {
  it('strips a retry suffix', () => {
    expect(normalizeMerchantPaymentReference('42-r3')).toBe('42');
  });

  it('trims surrounding whitespace before stripping', () => {
    expect(normalizeMerchantPaymentReference('  42-r12 ')).toBe('42');
  });

  it('leaves a reference with no retry suffix alone', () => {
    expect(normalizeMerchantPaymentReference('42')).toBe('42');
  });

  it('only strips a numeric -r<n> suffix', () => {
    expect(normalizeMerchantPaymentReference('42-rx')).toBe('42-rx');
    expect(normalizeMerchantPaymentReference('-r2')).toBe('-r2');
  });
});

describe('extractMerchantPaymentId', () => {
  it('prefers extras.payment_id over every other reference', () => {
    expect(
      extractMerchantPaymentId(
        txn({
          extras: { payment_id: '11' },
          order: { id: 777, merchant_order_id: '22' },
          special_reference: '33',
        }),
      ),
    ).toBe(11);
  });

  it('falls back to order.merchant_order_id, stripping the retry suffix', () => {
    expect(extractMerchantPaymentId(txn({ order: { id: 777, merchant_order_id: '22-r2' } }))).toBe(22);
  });

  it('falls back to payment_key_claims.extra.merchant_reference', () => {
    expect(
      extractMerchantPaymentId(txn({ payment_key_claims: { extra: { merchant_reference: '44' } } })),
    ).toBe(44);
  });

  it('falls back to payment_key_claims.extra.payment_id', () => {
    expect(extractMerchantPaymentId(txn({ payment_key_claims: { extra: { payment_id: '55' } } }))).toBe(55);
  });

  it('falls back to special_reference', () => {
    expect(extractMerchantPaymentId(txn({ special_reference: '66-r4' }))).toBe(66);
  });

  it('returns null when no reference is present', () => {
    expect(extractMerchantPaymentId(txn())).toBeNull();
  });

  it('returns null for an empty reference', () => {
    expect(extractMerchantPaymentId(txn({ extras: { payment_id: '' } }))).toBeNull();
  });

  it.each([
    ['non-numeric', 'abc'],
    ['zero', '0'],
    ['negative', '-5'],
    ['fractional', '1.5'],
    ['beyond a safe integer', '9007199254740993'],
  ])('rejects a %s reference', (_label, ref) => {
    expect(extractMerchantPaymentId(txn({ extras: { payment_id: ref } }))).toBeNull();
  });

  it('accepts a numeric (not string) reference', () => {
    expect(extractMerchantPaymentId(txn({ special_reference: 77 }))).toBe(77);
  });
});
