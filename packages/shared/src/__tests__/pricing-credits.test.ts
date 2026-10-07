import { describe, expect, it } from 'vitest';

import { pointHoursToCover, previewPackageHours } from '../pricing';

describe('pointHoursToCover', () => {
  it('is the whole hours that pay off what is owed', () => {
    expect(pointHoursToCover(720, 360)).toBe(2);
  });

  it('rounds a part-hour up, so the points can clear the balance', () => {
    // 1h + EGP 1 owed — a second point-hour is needed to reach EGP 0.
    expect(pointHoursToCover(361, 360)).toBe(2);
    expect(pointHoursToCover(180, 360)).toBe(1);
  });

  it('ignores float noise in an exact multiple', () => {
    expect(pointHoursToCover(0.1 + 0.2, 0.1)).toBe(3);
  });

  it('is 0 when nothing is owed or an hour is worthless', () => {
    expect(pointHoursToCover(0, 360)).toBe(0);
    expect(pointHoursToCover(-5, 360)).toBe(0);
    expect(pointHoursToCover(720, 0)).toBe(0);
  });
});

describe('previewPackageHours', () => {
  const base = {
    baseRate: 400,
    durationMultiplier: 0.9,
    durationHours: 4,
    skillFeesPerHour: [] as number[],
  };

  it('covers the whole booking when the package holds enough hours', () => {
    // 4h × 400 × 0.9 = 1440 owed; each package hour is worth 360.
    const preview = previewPackageHours({
      ...base,
      totalAmount: 1440,
      buckets: [{ hoursRemaining: 18, maxSkills: 0 }],
    });
    expect(preview).toEqual({ hoursApplied: 4, creditAmount: 1440, skillsCovered: 0 });
  });

  it('covers only the hours the package still holds', () => {
    const preview = previewPackageHours({
      ...base,
      totalAmount: 1440,
      buckets: [{ hoursRemaining: 2, maxSkills: 0 }],
    });
    expect(preview).toEqual({ hoursApplied: 2, creditAmount: 720, skillsCovered: 0 });
  });

  it('draws across buckets in the order given (soonest-expiring first)', () => {
    const preview = previewPackageHours({
      ...base,
      totalAmount: 1440,
      buckets: [
        { hoursRemaining: 1, maxSkills: 0 },
        { hoursRemaining: 1.5, maxSkills: 0 },
      ],
    });
    expect(preview.hoursApplied).toBe(2.5);
    expect(preview.creditAmount).toBe(900);
  });

  it('never spends hours a promo already paid for', () => {
    // A promo left 500 owed: only 1.38h of package value is worth spending.
    const preview = previewPackageHours({
      ...base,
      totalAmount: 500,
      buckets: [{ hoursRemaining: 18, maxSkills: 0 }],
    });
    expect(preview.hoursApplied).toBe(1.38);
    expect(preview.creditAmount).toBe(496.8);
  });

  it('waives skill fees only up to the allowance of the buckets it draws from', () => {
    // A 100/h skill. The first bucket (drawn first) covers no skills, so even
    // though a later one would, the credit is priced at the base rate only.
    const preview = previewPackageHours({
      ...base,
      durationMultiplier: 1,
      skillFeesPerHour: [100],
      totalAmount: 2000,
      buckets: [
        { hoursRemaining: 4, maxSkills: 0 },
        { hoursRemaining: 10, maxSkills: 1 },
      ],
    });
    expect(preview.skillsCovered).toBe(0);
    expect(preview.creditAmount).toBe(1600);
  });

  it('is nothing without a balance or anything owed', () => {
    const none = { hoursApplied: 0, creditAmount: 0, skillsCovered: 0 };
    expect(previewPackageHours({ ...base, totalAmount: 1440, buckets: [] })).toEqual(none);
    expect(
      previewPackageHours({ ...base, totalAmount: 0, buckets: [{ hoursRemaining: 5, maxSkills: 0 }] }),
    ).toEqual(none);
  });
});
