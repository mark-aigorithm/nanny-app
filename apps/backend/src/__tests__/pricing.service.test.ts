import {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
  resolveEffectiveRate,
  type SkillAddOnInput,
} from '@backend/services/pricing.service';

const FRENCH: SkillAddOnInput = { id: 's1', name: 'French speaker', feeType: 'FLAT', feeValue: 20 };
const SPECIAL: SkillAddOnInput = {
  id: 's2',
  name: 'Special needs',
  feeType: 'PERCENTAGE',
  feeValue: 10,
};
const FREE: SkillAddOnInput = { id: 's3', name: 'First aid', feeType: null, feeValue: 0 };

describe('resolveEffectiveRate', () => {
  it('adds flat and percentage skill fees on top of the base rate', () => {
    const { effectiveHourlyRate, applied } = resolveEffectiveRate(120, [FRENCH, SPECIAL]);
    // 120 + 20 (flat) + 12 (10% of 120) = 152
    expect(effectiveHourlyRate).toBe(152);
    expect(applied.find((a) => a.id === 's1')?.amountPerHour).toBe(20);
    expect(applied.find((a) => a.id === 's2')?.amountPerHour).toBe(12);
  });

  it('treats a null-fee skill as a zero surcharge', () => {
    const { effectiveHourlyRate, applied } = resolveEffectiveRate(120, [FREE]);
    expect(effectiveHourlyRate).toBe(120);
    expect(applied[0]?.amountPerHour).toBe(0);
  });

  it('returns the base rate unchanged with no add-ons', () => {
    expect(resolveEffectiveRate(120, []).effectiveHourlyRate).toBe(120);
  });
});

describe('resolveDurationMultiplier', () => {
  const rules = [
    { minHours: 3, multiplier: 0.9 },
    { minHours: 6, multiplier: 0.8 },
  ];

  it('picks the highest tier at or below the booking length', () => {
    expect(resolveDurationMultiplier(4, rules)).toBe(0.9);
    expect(resolveDurationMultiplier(7, rules)).toBe(0.8);
  });

  it('applies a tier exactly at its minHours boundary', () => {
    expect(resolveDurationMultiplier(3, rules)).toBe(0.9);
  });

  it('defaults to 1 when no tier matches', () => {
    expect(resolveDurationMultiplier(2, rules)).toBe(1);
    expect(resolveDurationMultiplier(1, [])).toBe(1);
  });
});

describe('calculatePriceBreakdown', () => {
  it('prices base rate only with the nanny/platform split', () => {
    const b = calculatePriceBreakdown({
      baseRate: 120,
      durationHours: 2,
      nannyPercent: 80,
      platformPercent: 20,
    });
    expect(b.effectiveHourlyRate).toBe(120);
    expect(b.subtotal).toBe(240);
    expect(b.totalAmount).toBe(240);
    expect(b.nannyAmount).toBe(192); // 80% of 240
    expect(b.platformAmount).toBe(48); // remainder
    expect(b.serviceFeeAmount).toBe(0); // legacy fee retired under the split
  });

  it('applies skill add-ons and a duration multiplier before the split', () => {
    // (120 + 20 + 12) × 3h × 0.9 = 152 × 3 × 0.9 = 410.4
    const b = calculatePriceBreakdown({
      baseRate: 120,
      durationHours: 3,
      skillAddOns: [FRENCH, SPECIAL],
      durationMultiplier: 0.9,
      nannyPercent: 80,
      platformPercent: 20,
    });
    expect(b.effectiveHourlyRate).toBe(152);
    expect(b.subtotal).toBe(410.4);
    expect(b.totalAmount).toBe(410.4);
    expect(b.nannyAmount).toBe(328.32); // 80% of 410.4
    expect(b.platformAmount).toBe(82.08);
    expect(b.skillAddOns).toHaveLength(2);
  });

  it('subtracts a promo discount from the subtotal before splitting', () => {
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 50,
      nannyPercent: 70,
      platformPercent: 30,
    });
    expect(b.subtotal).toBe(200);
    expect(b.discountAmount).toBe(50);
    expect(b.totalAmount).toBe(150);
    expect(b.nannyAmount).toBe(105); // 70% of 150
    expect(b.platformAmount).toBe(45);
  });

  it('caps the discount at the subtotal so totalAmount never goes negative', () => {
    const b = calculatePriceBreakdown({
      baseRate: 100,
      durationHours: 2,
      discountAmount: 500,
      nannyPercent: 80,
      platformPercent: 20,
    });
    expect(b.discountAmount).toBe(200);
    expect(b.totalAmount).toBe(0);
    expect(b.nannyAmount).toBe(0);
    expect(b.platformAmount).toBe(0);
  });
});
