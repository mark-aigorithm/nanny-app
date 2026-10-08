import { extractLatestTransactionId, mapIntentionElement } from '@backend/lib/paymob/intention';

/**
 * How a polled Paymob intention is read. Only a transaction that Paymob marks
 * successful AND no longer pending counts as money taken; anything less is
 * still "pending" so the reconciler keeps watching.
 */
describe('mapIntentionElement', () => {
  it('reads a successful, settled transaction as captured', () => {
    expect(mapIntentionElement({ transactions: [{ success: true, pending: false }] })).toBe('captured');
  });

  it('reads a declined, settled transaction as failed', () => {
    expect(mapIntentionElement({ transactions: [{ success: false, pending: false }] })).toBe('failed');
  });

  it('judges by the latest settled transaction: a retry that succeeded after a decline is captured', () => {
    expect(
      mapIntentionElement({
        transactions: [
          { id: 1, success: false, pending: false },
          { id: 2, success: true, pending: false },
        ],
      }),
    ).toBe('captured');
  });

  it('judges by the latest settled transaction: a decline after an earlier success is failed', () => {
    expect(
      mapIntentionElement({
        transactions: [
          { id: 1, success: true, pending: false },
          { id: 2, success: false, pending: false },
        ],
      }),
    ).toBe('failed');
  });

  it('skips a still-pending latest transaction and reads the one before it', () => {
    expect(
      mapIntentionElement({
        transactions: [
          { id: 1, success: true, pending: false },
          { id: 2, success: false, pending: true },
        ],
      }),
    ).toBe('captured');
  });

  it.each(['failed', 'DECLINED', 'Voided', 'cancelled'])(
    'reads a "%s" intention status with no settled transaction as failed',
    (status) => {
      expect(mapIntentionElement({ status, transactions: [] })).toBe('failed');
    },
  );

  it('does not trust `confirmed` or a success-like status without a successful transaction', () => {
    expect(mapIntentionElement({ confirmed: true, status: 'succeeded', transactions: [] })).toBe('pending');
  });

  it('treats an element with no transactions and no status as pending', () => {
    expect(mapIntentionElement({})).toBe('pending');
  });

  it('treats only-pending transactions as pending', () => {
    expect(mapIntentionElement({ transactions: [{ success: true, pending: true }] })).toBe('pending');
  });
});

describe('extractLatestTransactionId', () => {
  it('returns the latest numeric transaction id as a string', () => {
    expect(extractLatestTransactionId({ transactions: [{ id: 1 }, { id: 2 }] })).toBe('2');
  });

  it('accepts a string transaction id', () => {
    expect(extractLatestTransactionId({ transactions: [{ id: 'tx_9' } as never] })).toBe('tx_9');
  });

  it('walks back past entries with no usable id', () => {
    expect(
      extractLatestTransactionId({ transactions: [{ id: 5 }, { id: '' } as never, {}] }),
    ).toBe('5');
  });

  it('returns null when no transaction has an id', () => {
    expect(extractLatestTransactionId({ transactions: [{}, { id: '' } as never] })).toBeNull();
  });

  it('returns null when there are no transactions', () => {
    expect(extractLatestTransactionId({})).toBeNull();
  });
});
