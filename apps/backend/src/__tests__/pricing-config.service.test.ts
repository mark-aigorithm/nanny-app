jest.mock('@backend/services/app-settings.service', () => ({
  getStandardHourlyRate: jest.fn().mockResolvedValue(120),
  getServiceFeePercent: jest.fn().mockResolvedValue(0),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getPlatformConfig: jest.fn().mockResolvedValue({
    includedChildrenPerBooking: 2,
    maxChildrenPerBooking: 4,
    extraChildFeeType: 'FLAT',
    extraChildFeeValue: 30,
  }),
}));

jest.mock('@backend/services/skill.service', () => ({
  listActiveSkills: jest.fn().mockResolvedValue([
    { id: 201, name: 'French speaker', feeType: 'FLAT', feeValue: 20 },
    { id: 202, name: 'Special needs', feeType: 'PERCENTAGE', feeValue: 10 },
    { id: 203, name: 'First aid', feeType: null, feeValue: 0 },
  ]),
}));

jest.mock('@backend/services/duration-rule.service', () => ({
  listActiveDurationRules: jest.fn().mockResolvedValue([{ minHours: 3, multiplier: 0.9, label: 'Half day' }]),
}));

import {
  buildBreakdown,
  getPricingConfig,
  getPricingInputs,
  previewBreakdown,
} from '@backend/services/pricing-config.service';

describe('getPricingInputs / getPricingConfig', () => {
  it('composes base rate, split, add-on skills and duration tiers', async () => {
    const config = await getPricingConfig();
    expect(config.standardHourlyRate).toBe(120);
    expect(config.nannyPercent).toBe(80);
    expect(config.platformPercent).toBe(20);
    expect(config.skillAddOns).toHaveLength(3);
    expect(config.durationRules).toEqual([{ minHours: 3, multiplier: 0.9, label: 'Half day' }]);
  });
});

describe('buildBreakdown', () => {
  it('prices selected add-ons with the matching duration tier and split', async () => {
    const inputs = await getPricingInputs();
    // (120 + 20 French + 12 special) × 3h × 0.9 = 410.4
    const b = buildBreakdown(inputs, { durationHours: 3, skillIds: [201, 202] });
    expect(b.effectiveHourlyRate).toBe(152);
    expect(b.durationMultiplier).toBe(0.9);
    expect(b.subtotal).toBe(410.4);
    expect(b.nannyAmount).toBe(328.32);
  });

  it('rejects an unknown skill id', async () => {
    const inputs = await getPricingInputs();
    expect(() => buildBreakdown(inputs, { durationHours: 2, skillIds: [999] })).toThrow();
  });

  it('applies the configured extra-child fee to the hourly rate', async () => {
    const inputs = await getPricingInputs();
    // 4 children, 2 included → 2 extra × EGP 30 on top of the 120 base.
    const b = buildBreakdown(inputs, { durationHours: 2, skillIds: [], childrenCount: 4 });
    expect(b.extraChildren).toBe(2);
    expect(b.extraChildFeePerHour).toBe(60);
    expect(b.effectiveHourlyRate).toBe(180);
    expect(b.subtotal).toBe(360);
  });

  it('defaults to one child when the caller has no children context', async () => {
    // The promo preview and the admin re-price go through here without children;
    // they must keep pricing exactly as they did before the rule existed.
    const inputs = await getPricingInputs();
    const b = buildBreakdown(inputs, { durationHours: 2, skillIds: [] });
    expect(b.childrenCount).toBe(1);
    expect(b.extraChildFeePerHour).toBe(0);
    expect(b.effectiveHourlyRate).toBe(120);
  });
});

describe('previewBreakdown', () => {
  it('loads inputs and returns a full breakdown for the admin calculator', async () => {
    const b = await previewBreakdown({ durationHours: 2, skillIds: [] });
    expect(b.effectiveHourlyRate).toBe(120);
    expect(b.subtotal).toBe(240); // no duration tier at 2h
    expect(b.totalAmount).toBe(240);
  });
});
