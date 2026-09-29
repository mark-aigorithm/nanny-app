import { coveredInFullSentence, isNothingToPay } from '@mobile/lib/nothingToPay';

const priced = (over: Partial<Parameters<typeof coveredInFullSentence>[0]> = {}) => ({
  totalAmount: 0,
  discountAmount: 0,
  rewardCreditAmount: 0,
  packageCreditAmount: 0,
  ...over,
});

describe('isNothingToPay', () => {
  it('is true only when nothing is owed', () => {
    expect(isNothingToPay({ totalAmount: 0 })).toBe(true);
    expect(isNothingToPay({ totalAmount: 0.01 })).toBe(false);
    expect(isNothingToPay({ totalAmount: 318 })).toBe(false);
  });
});

describe('coveredInFullSentence', () => {
  it('names a promo — the discount left after points and package credit', () => {
    expect(coveredInFullSentence(priced({ discountAmount: 300 }))).toBe(
      'Your promo code covers this booking in full.',
    );
  });

  it('does not mistake Care Points folded into the discount for a promo', () => {
    expect(coveredInFullSentence(priced({ discountAmount: 300, rewardCreditAmount: 300 }))).toBe(
      'Your Care Points cover this booking in full.',
    );
  });

  it('names package hours', () => {
    expect(coveredInFullSentence(priced({ discountAmount: 300, packageCreditAmount: 300 }))).toBe(
      'Your package hours cover this booking in full.',
    );
  });

  it('lists everything that contributed', () => {
    expect(
      coveredInFullSentence(
        priced({ discountAmount: 300, rewardCreditAmount: 100, packageCreditAmount: 100 }),
      ),
    ).toBe('Your promo code, Care Points and package hours cover this booking in full.');
  });

  it('falls back to a neutral sentence', () => {
    expect(coveredInFullSentence(priced())).toBe('This booking is covered in full.');
  });
});
