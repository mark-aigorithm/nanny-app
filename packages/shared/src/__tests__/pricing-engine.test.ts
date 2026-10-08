import { describe, expect, it } from 'vitest';

import {
  calculatePriceBreakdown,
  packageHoursCreditFor,
  planPackageHoursRedemption,
  pointHoursToCover,
  previewPackageHours,
  resolveDurationMultiplier,
  resolveEffectiveRate,
  resolveExtraChildFee,
  resolvePackageHourValue,
  type SkillAddOnInput,
} from '../pricing';

/**
 * The pricing engine is the one place booking money is computed — the backend
 * charges with it and the app estimates with it. Every rule is pinned here with
 * worked examples, and the invariants that must hold for any input (the split
 * adds up, nothing goes negative, a discount never exceeds what it discounts)
 * are checked across a grid of inputs.
 */

const SPLIT = { nannyPercent: 80, platformPercent: 20 };

const FIRST_AID: SkillAddOnInput = { id: 1, name: 'First aid', feeType: 'FLAT', feeValue: 20 };
const ARABIC: SkillAddOnInput = { id: 2, name: 'Arabic', feeType: 'PERCENTAGE', feeValue: 10 };
const FREE: SkillAddOnInput = { id: 3, name: 'Crafts', feeType: null, feeValue: 50 };

describe('resolveEffectiveRate', () => {
  it('is the base rate when no add-ons are selected', () => {
    expect(resolveEffectiveRate(120, [])).toEqual({ effectiveHourlyRate: 120, applied: [] });
  });

  it('adds a FLAT fee as EGP per hour', () => {
    const { effectiveHourlyRate, applied } = resolveEffectiveRate(120, [FIRST_AID]);
    expect(effectiveHourlyRate).toBe(140);
    expect(applied[0]).toMatchObject({ id: 1, amountPerHour: 20 });
  });

  it('adds a PERCENTAGE fee as a share of the base rate', () => {
    expect(resolveEffectiveRate(120, [ARABIC]).effectiveHourlyRate).toBe(132);
  });

  it('charges nothing for an add-on with no fee type, whatever its value', () => {
    const { effectiveHourlyRate, applied } = resolveEffectiveRate(120, [FREE]);
    expect(effectiveHourlyRate).toBe(120);
    expect(applied[0]!.amountPerHour).toBe(0);
  });

  it('sums several add-ons and itemises each one', () => {
    const { effectiveHourlyRate, applied } = resolveEffectiveRate(120, [FIRST_AID, ARABIC, FREE]);
    expect(effectiveHourlyRate).toBe(152);
    expect(applied.map((a) => a.amountPerHour)).toEqual([20, 12, 0]);
  });

  it('rounds each add-on to piastres', () => {
    const third: SkillAddOnInput = { id: 4, name: 'Third', feeType: 'PERCENTAGE', feeValue: 33.333 };
    expect(resolveEffectiveRate(100, [third]).applied[0]!.amountPerHour).toBe(33.33);
  });
});

describe('resolveExtraChildFee', () => {
  const FLAT_30 = { includedChildren: 2, feeType: 'FLAT' as const, feeValue: 30 };

  it('charges nothing while the children fit the allowance', () => {
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 2 })).toEqual({
      extraChildren: 0,
      amountPerHour: 0,
    });
  });

  it('charges a FLAT fee per extra child', () => {
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 4 })).toEqual({
      extraChildren: 2,
      amountPerHour: 60,
    });
  });

  it('charges a PERCENTAGE fee per extra child against the base rate', () => {
    expect(
      resolveExtraChildFee(120, { childrenCount: 3, includedChildren: 2, feeType: 'PERCENTAGE', feeValue: 25 }),
    ).toEqual({ extraChildren: 1, amountPerHour: 30 });
  });

  it('counts the extra children even when the fee is switched off', () => {
    expect(
      resolveExtraChildFee(120, { childrenCount: 4, includedChildren: 2, feeType: null, feeValue: 30 }),
    ).toEqual({ extraChildren: 2, amountPerHour: 0 });
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 4, feeValue: 0 }).amountPerHour).toBe(0);
  });

  it('fails to "no fee", never to NaN, on malformed settings', () => {
    const broken = resolveExtraChildFee(120, {
      childrenCount: Number.NaN,
      includedChildren: Number.NaN,
      feeType: 'FLAT',
      feeValue: Number.NaN,
    });
    expect(broken.amountPerHour).toBe(0);
    expect(Number.isNaN(broken.extraChildren)).toBe(false);
  });

  it('ignores a fractional child count', () => {
    expect(resolveExtraChildFee(120, { ...FLAT_30, childrenCount: 3.9 }).extraChildren).toBe(1);
  });
});

describe('resolveDurationMultiplier', () => {
  const RULES = [
    { minHours: 6, multiplier: 0.95 },
    { minHours: 8, multiplier: 0.9 },
  ];

  it('is 1 below every tier', () => {
    expect(resolveDurationMultiplier(4, RULES)).toBe(1);
  });

  it('applies a tier from its exact boundary', () => {
    expect(resolveDurationMultiplier(6, RULES)).toBe(0.95);
  });

  it('picks the highest tier that applies, whatever order the rules come in', () => {
    expect(resolveDurationMultiplier(10, RULES)).toBe(0.9);
    expect(resolveDurationMultiplier(10, [...RULES].reverse())).toBe(0.9);
  });

  it('is 1 with no rules at all', () => {
    expect(resolveDurationMultiplier(12, [])).toBe(1);
  });
});

describe('calculatePriceBreakdown', () => {
  it('prices a plain booking: rate × hours, split between nanny and platform', () => {
    const b = calculatePriceBreakdown({ baseRate: 120, durationHours: 4, ...SPLIT });
    expect(b).toMatchObject({
      effectiveHourlyRate: 120,
      subtotal: 480,
      discountAmount: 0,
      totalAmount: 480,
      nannyAmount: 384,
      platformAmount: 96,
      serviceFeePercent: 0,
      serviceFeeAmount: 0,
      childrenCount: 1,
      extraChildren: 0,
    });
  });

  it('folds add-ons and extra children into the hourly rate', () => {
    const b = calculatePriceBreakdown({
      baseRate: 120,
      durationHours: 4,
      skillAddOns: [FIRST_AID],
      extraChildFee: { childrenCount: 3, includedChildren: 2, feeType: 'FLAT', feeValue: 30 },
      ...SPLIT,
    });
    expect(b.effectiveHourlyRate).toBe(170);
    expect(b.extraChildFeePerHour).toBe(30);
    expect(b.subtotal).toBe(680);
  });

  it('applies the duration discount to the whole subtotal', () => {
    const b = calculatePriceBreakdown({ baseRate: 120, durationHours: 8, durationMultiplier: 0.9, ...SPLIT });
    expect(b.subtotal).toBe(864);
    expect(b.totalAmount).toBe(864);
  });

  it('takes a promo discount off the discounted subtotal', () => {
    const b = calculatePriceBreakdown({ baseRate: 120, durationHours: 4, discountAmount: 100, ...SPLIT });
    expect(b.totalAmount).toBe(380);
    expect(b.nannyAmount).toBe(304);
    expect(b.platformAmount).toBe(76);
  });

  it('caps a discount at the subtotal, so the total is never negative', () => {
    const b = calculatePriceBreakdown({ baseRate: 120, durationHours: 4, discountAmount: 10_000, ...SPLIT });
    expect(b.discountAmount).toBe(480);
    expect(b.totalAmount).toBe(0);
    expect(b.nannyAmount).toBe(0);
    expect(b.platformAmount).toBe(0);
  });

  it('gives the rounding remainder to the platform, so the split always adds up', () => {
    // 3 × 33.33 = 99.99; 80% is 79.992 → 79.99, leaving 20.00 for the platform.
    const b = calculatePriceBreakdown({ baseRate: 33.33, durationHours: 3, ...SPLIT });
    expect(b.totalAmount).toBe(99.99);
    expect(b.nannyAmount + b.platformAmount).toBeCloseTo(b.totalAmount, 10);
  });

  it('prices part-hours', () => {
    expect(calculatePriceBreakdown({ baseRate: 120, durationHours: 2.5, ...SPLIT }).totalAmount).toBe(300);
  });

  it('honours any revenue split, including all to one side', () => {
    const allNanny = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      nannyPercent: 100,
      platformPercent: 0,
    });
    expect(allNanny).toMatchObject({ nannyAmount: 200, platformAmount: 0 });

    const allPlatform = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      nannyPercent: 0,
      platformPercent: 100,
    });
    expect(allPlatform).toMatchObject({ nannyAmount: 0, platformAmount: 200 });
  });

  describe('invariants, across a grid of inputs', () => {
    const rates = [0, 1, 99.99, 120, 333.33];
    const hours = [1, 2.5, 4, 12];
    const multipliers = [1, 0.95, 0.9];
    const discounts = [0, 0.01, 50, 1_000_000];
    const splits = [80, 70, 100, 0];

    const cases = rates.flatMap((baseRate) =>
      hours.flatMap((durationHours) =>
        multipliers.flatMap((durationMultiplier) =>
          discounts.flatMap((discountAmount) =>
            splits.map((nannyPercent) => ({
              baseRate,
              durationHours,
              durationMultiplier,
              discountAmount,
              nannyPercent,
              platformPercent: 100 - nannyPercent,
            })),
          ),
        ),
      ),
    );

    it.each(cases)('holds for %o', (input) => {
      const b = calculatePriceBreakdown({ ...input, skillAddOns: [FIRST_AID, ARABIC] });

      for (const value of [b.subtotal, b.discountAmount, b.totalAmount, b.nannyAmount, b.platformAmount]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        // Every money value is whole piastres.
        expect(Math.round(value * 100)).toBeCloseTo(value * 100, 6);
      }
      expect(b.discountAmount).toBeLessThanOrEqual(b.subtotal);
      expect(b.totalAmount).toBeCloseTo(b.subtotal - b.discountAmount, 2);
      expect(b.nannyAmount + b.platformAmount).toBeCloseTo(b.totalAmount, 2);
      expect(b.nannyAmount).toBeLessThanOrEqual(b.totalAmount);
    });
  });
});

describe('resolvePackageHourValue', () => {
  it('is the base rate scaled by the duration discount when no skills are covered', () => {
    expect(
      resolvePackageHourValue({ baseRate: 120, durationMultiplier: 0.9, maxSkillsAllowed: 0, skillFeesPerHour: [20] }),
    ).toEqual({ creditPerHour: 108, skillsCovered: 0 });
  });

  it('waives the most expensive add-ons first, up to the allowance', () => {
    expect(
      resolvePackageHourValue({
        baseRate: 100,
        durationMultiplier: 1,
        maxSkillsAllowed: 2,
        skillFeesPerHour: [5, 30, 10],
      }),
    ).toEqual({ creditPerHour: 140, skillsCovered: 2 });
  });

  it('never covers more add-ons than were selected', () => {
    expect(
      resolvePackageHourValue({ baseRate: 100, durationMultiplier: 1, maxSkillsAllowed: 5, skillFeesPerHour: [10] }),
    ).toEqual({ creditPerHour: 110, skillsCovered: 1 });
  });
});

describe('planPackageHoursRedemption', () => {
  const BASE = {
    baseRate: 120,
    durationMultiplier: 1,
    totalAmount: 480,
    durationHours: 4,
    availableHours: 10,
    maxSkillsAllowed: 0,
    skillFeesPerHour: [],
  };

  it('covers the whole booking when the balance allows', () => {
    expect(planPackageHoursRedemption(BASE)).toEqual({ hoursToRedeem: 4, skillsCovered: 0, creditPerHour: 120 });
  });

  it('spends no more hours than she holds', () => {
    expect(planPackageHoursRedemption({ ...BASE, availableHours: 1.5 }).hoursToRedeem).toBe(1.5);
  });

  it('spends only the hours the amount still owed can absorb (a promo already paid for the rest)', () => {
    // 300 owed at 120/h → 2.5 hours; spending 4 would burn 1.5 prepaid hours for nothing.
    expect(planPackageHoursRedemption({ ...BASE, totalAmount: 300 }).hoursToRedeem).toBe(2.5);
  });

  it('rounds the affordable hours down, never up', () => {
    // 100 / 120 = 0.8333… → 0.83, not 0.84.
    expect(planPackageHoursRedemption({ ...BASE, totalAmount: 100 }).hoursToRedeem).toBe(0.83);
  });

  it('spends nothing when nothing is owed, nothing is held, or an hour is worthless', () => {
    const none = { hoursToRedeem: 0, skillsCovered: 0, creditPerHour: 0 };
    expect(planPackageHoursRedemption({ ...BASE, totalAmount: 0 })).toEqual(none);
    expect(planPackageHoursRedemption({ ...BASE, availableHours: 0 })).toEqual(none);
    expect(planPackageHoursRedemption({ ...BASE, durationHours: 0 })).toEqual(none);
    expect(planPackageHoursRedemption({ ...BASE, baseRate: 0 })).toEqual(none);
  });
});

describe('packageHoursCreditFor', () => {
  it('is the hours applied at their value', () => {
    expect(packageHoursCreditFor({ hoursApplied: 2.5, creditPerHour: 120, totalAmount: 480 })).toBe(300);
  });

  it('never credits more than is owed', () => {
    expect(packageHoursCreditFor({ hoursApplied: 4, creditPerHour: 120, totalAmount: 400 })).toBe(400);
  });

  it('is nothing for no hours', () => {
    expect(packageHoursCreditFor({ hoursApplied: 0, creditPerHour: 120, totalAmount: 480 })).toBe(0);
  });
});

describe('previewPackageHours — credit never exceeds what is owed', () => {
  it.each([
    [480, 4],
    [300, 10],
    [0.5, 10],
    [1_000, 2],
  ])('owed %d with %d hours held', (totalAmount, hoursRemaining) => {
    const preview = previewPackageHours({
      baseRate: 120,
      durationMultiplier: 1,
      totalAmount,
      durationHours: 4,
      buckets: [{ hoursRemaining, maxSkills: 0 }],
      skillFeesPerHour: [],
    });
    expect(preview.creditAmount).toBeLessThanOrEqual(totalAmount);
    expect(preview.hoursApplied).toBeLessThanOrEqual(Math.min(4, hoursRemaining));
    expect(preview.creditAmount).toBeGreaterThanOrEqual(0);
  });
});

describe('pointHoursToCover — never short of what is owed', () => {
  it.each([
    [480, 120],
    [481, 120],
    [0.01, 120],
    [359.99, 120],
  ])('owed %d at %d per hour', (owed, perHour) => {
    const hours = pointHoursToCover(owed, perHour);
    expect(hours * perHour).toBeGreaterThanOrEqual(owed);
    expect((hours - 1) * perHour).toBeLessThan(owed);
  });
});
