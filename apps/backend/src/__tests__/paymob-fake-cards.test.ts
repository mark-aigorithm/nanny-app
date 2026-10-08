import { cardOutcome } from '../../test/fakes/paymob-server';

/**
 * The fake judges a card the way the E2E flows expect Paymob's sandbox to:
 * by the test cards in test-support/paymob/checkout.json.
 */
describe('Paymob fake — cardOutcome', () => {
  it('approves the documented approved test card', () => {
    expect(
      cardOutcome({ cardNumber: '5123456789012346', expiry: '01/39', cvv: '123', name: 'Test Account' }),
    ).toBe('approved');
  });

  it('ignores the spaces a card form adds', () => {
    expect(cardOutcome({ cardNumber: '5123 4567 8901 2346', expiry: '01 / 39', cvv: '123' })).toBe('approved');
  });

  it('declines the declined test card', () => {
    expect(cardOutcome({ cardNumber: '5123456789012346', expiry: '05/39', cvv: '123' })).toBe('declined');
  });

  it('declines a card it does not know', () => {
    expect(cardOutcome({ cardNumber: '4000000000000002', expiry: '01/39', cvv: '123' })).toBe('declined');
  });

  it('declines an empty form', () => {
    expect(cardOutcome({})).toBe('declined');
  });
});
