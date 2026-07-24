import {
  calculatePriceBreakdown,
  resolveExtraChildFee,
  type ExtraChildFeeInput,
} from '@backend/services/pricing.service';

/**
 * The extra-child rule: what children beyond the included allowance add to the
 * hourly rate, and how that flows through the rest of the breakdown.
 *
 * The point of folding the fee into `effectiveHourlyRate` rather than bolting it
 * on at the end is that every downstream rule — duration tiers, the revenue
 * split, Care Points, mid-shift extensions — then prices multi-child bookings
 * correctly without knowing this rule exists. The `calculatePriceBreakdown`
 * cases below are what pin that.
 */

const FLAT_30: ExtraChildFeeInput = {
  childrenCount: 3,
  includedChildren: 2,
  feeType: 'FLAT',
  feeValue: 30,
};

describe('resolveExtraChildFee', () => {
  it('charges a flat fee per child beyond the allowance', () => {
    // 3 children, 2 included → 1 extra × EGP 30.
    expect(resolveExtraChildFee(120, FLAT_30)).toEqual({
      extraChildren: 1,
      amountPerHour: 30,
    });
  });

  it('charges per extra child, not once for the overage', () => {
    // The whole reason a 4th child costs more than a 3rd.
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 4 })).toEqual({
      extraChildren: 2,
      amountPerHour: 60,
    });
  });

  it('reads a percentage fee against the base rate', () => {
    // 2 extra × 25% of 120 = 60.
    const fee = resolveExtraChildFee(120, {
      childrenCount: 4,
      includedChildren: 2,
      feeType: 'PERCENTAGE',
      feeValue: 25,
    });
    expect(fee).toEqual({ extraChildren: 2, amountPerHour: 60 });
  });

  it('charges nothing at or below the allowance', () => {
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 2 }).amountPerHour).toBe(0);
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 1 })).toEqual({
      extraChildren: 0,
      amountPerHour: 0,
    });
  });

  it('treats a null fee type as extra children being free', () => {
    const fee = resolveExtraChildFee(120, { ...FLAT_30, feeType: null });
    // Still reports the count — the UI says "3 children", it just costs nothing.
    expect(fee).toEqual({ extraChildren: 1, amountPerHour: 0 });
  });

  it('falls back to no fee rather than NaN on a malformed config', () => {
    // An unseeded setting must under-charge, never poison the total: a NaN price
    // is a booking nobody can pay for.
    const fee = resolveExtraChildFee(120, {
      ...FLAT_30,
      feeValue: Number.NaN,
    });
    expect(fee.amountPerHour).toBe(0);
    expect(
      resolveExtraChildFee(120, { ...FLAT_30, includedChildren: Number.NaN }).amountPerHour,
    ).toBe(0);
  });
});

describe('calculatePriceBreakdown — with extra children', () => {
  const base = {
    baseRate: 100,
    durationHours: 3,
    nannyPercent: 80,
    platformPercent: 20,
  };

  it('folds the fee into the hourly rate and scales it by the duration tier', () => {
    const b = calculatePriceBreakdown({
      ...base,
      durationMultiplier: 0.9,
      extraChildFee: { childrenCount: 4, includedChildren: 2, feeType: 'FLAT', feeValue: 30 },
    });

    // 100 + (2 extra × 30) = 160/hour.
    expect(b.effectiveHourlyRate).toBe(160);
    expect(b.extraChildFeePerHour).toBe(60);
    expect(b.extraChildren).toBe(2);
    expect(b.childrenCount).toBe(4);
    // The discount applies to the whole subtotal, child fee included — 480 × 0.9.
    expect(b.subtotal).toBe(432);
    expect(b.totalAmount).toBe(432);
  });

  it('splits the child fee with the nanny like every other component', () => {
    // She is minding more children, so she earns more for it.
    const b = calculatePriceBreakdown({ ...base, extraChildFee: FLAT_30 });
    expect(b.subtotal).toBe(390); // 130 × 3
    expect(b.nannyAmount).toBe(312); // 80%
    expect(b.platformAmount).toBe(78);
  });

  it('stacks with skill add-ons rather than replacing them', () => {
    const b = calculatePriceBreakdown({
      ...base,
      skillAddOns: [{ id: 1, name: 'French speaker', feeType: 'FLAT', feeValue: 20 }],
      extraChildFee: FLAT_30,
    });
    // 100 base + 20 skill + 30 child = 150.
    expect(b.effectiveHourlyRate).toBe(150);
    expect(b.skillAddOns[0]?.amountPerHour).toBe(20);
    expect(b.extraChildFeePerHour).toBe(30);
  });

  it('prices a single-child booking exactly as before when no children are given', () => {
    // Every caller with no children context — the promo preview, the admin
    // re-price on a time change — must keep behaving identically.
    const b = calculatePriceBreakdown(base);
    expect(b.effectiveHourlyRate).toBe(100);
    expect(b.extraChildFeePerHour).toBe(0);
    expect(b.extraChildren).toBe(0);
    expect(b.childrenCount).toBe(1);
    expect(b.totalAmount).toBe(300);
  });
});
