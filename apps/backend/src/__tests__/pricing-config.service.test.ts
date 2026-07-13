jest.mock('@backend/services/app-settings.service', () => ({
  getStandardHourlyRate: jest.fn().mockResolvedValue(120),
  getServiceFeePercent: jest.fn().mockResolvedValue(0),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
}));

jest.mock('@backend/services/skill.service', () => ({
  listActiveSkills: jest.fn().mockResolvedValue([
    { id: 's1', name: 'French speaker', feeType: 'FLAT', feeValue: 20 },
    { id: 's2', name: 'Special needs', feeType: 'PERCENTAGE', feeValue: 10 },
    { id: 's3', name: 'First aid', feeType: null, feeValue: 0 },
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
    const b = buildBreakdown(inputs, { durationHours: 3, skillIds: ['s1', 's2'] });
    expect(b.effectiveHourlyRate).toBe(152);
    expect(b.durationMultiplier).toBe(0.9);
    expect(b.subtotal).toBe(410.4);
    expect(b.nannyAmount).toBe(328.32);
  });

  it('rejects an unknown skill id', async () => {
    const inputs = await getPricingInputs();
    expect(() => buildBreakdown(inputs, { durationHours: 2, skillIds: ['nope'] })).toThrow();
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
