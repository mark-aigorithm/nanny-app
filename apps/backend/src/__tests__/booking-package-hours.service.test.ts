import {
  packageHoursCreditFor,
  planPackageHoursRedemption,
  resolvePackageHourValue,
} from '@nanny-app/shared';

/**
 * Pins how many prepaid hours a booking spends and what they are worth.
 *
 * The hours-to-spend decision has to happen BEFORE anything is debited. An
 * earlier version debited the full booking duration and only then capped the
 * credit at the total owed, which silently destroyed prepaid hours whenever a
 * promo had already pushed the total below their value. The regression cases
 * below are the ones that version got wrong.
 */
describe('planPackageHoursRedemption', () => {
  it('covers the whole booking when the balance and total allow it', () => {
    const plan = planPackageHoursRedemption({
      baseRate: 50,
      durationMultiplier: 1,
      totalAmount: 500,
      durationHours: 4,
      availableHours: 10,
      maxSkillsAllowed: 2,
      skillFeesPerHour: [],
    });
    expect(plan.hoursToRedeem).toBe(4);
    expect(plan.creditPerHour).toBe(50);
    // An allowance of 2 with nothing selected covers nothing.
    expect(plan.skillsCovered).toBe(0);
  });

  it('spends only the hours a promo-reduced total can pay for', () => {
    // 6h at 60 = 360 subtotal, but a 50%-off promo leaves 180 owed.
    // Spending all 6 hours would burn 360 EGP of prepaid value for 180 of benefit.
    const plan = planPackageHoursRedemption({
      baseRate: 60,
      durationMultiplier: 1,
      totalAmount: 180,
      durationHours: 6,
      availableHours: 10,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(plan.hoursToRedeem).toBe(3);
    expect(
      packageHoursCreditFor({
        hoursApplied: plan.hoursToRedeem,
        creditPerHour: plan.creditPerHour,
        totalAmount: 180,
      }),
    ).toBe(180);
  });

  it('spends nothing when a 100% promo leaves nothing owed', () => {
    // The worst case of the old bug: every hour burned for zero benefit.
    const plan = planPackageHoursRedemption({
      baseRate: 60,
      durationMultiplier: 1,
      totalAmount: 0,
      durationHours: 6,
      availableHours: 10,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(plan.hoursToRedeem).toBe(0);
  });

  it('never spends more hours than the parent holds', () => {
    const plan = planPackageHoursRedemption({
      baseRate: 60,
      durationMultiplier: 1,
      totalAmount: 600,
      durationHours: 6,
      availableHours: 2.5,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(plan.hoursToRedeem).toBe(2.5);
  });

  it('rounds affordable hours DOWN so the credit can never exceed the total', () => {
    // 190 / 60 = 3.1666… — rounding up would credit 190.02 against 190 owed.
    const plan = planPackageHoursRedemption({
      baseRate: 60,
      durationMultiplier: 1,
      totalAmount: 190,
      durationHours: 6,
      availableHours: 10,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(plan.hoursToRedeem).toBe(3.16);
    const credit = packageHoursCreditFor({
      hoursApplied: plan.hoursToRedeem,
      creditPerHour: plan.creditPerHour,
      totalAmount: 190,
    });
    expect(credit).toBeLessThanOrEqual(190);
  });

  it('waives the most expensive skills first, up to the allowance', () => {
    const plan = planPackageHoursRedemption({
      baseRate: 50,
      durationMultiplier: 1,
      totalAmount: 1000,
      durationHours: 3,
      availableHours: 10,
      maxSkillsAllowed: 2,
      // Allowance of 2 against three add-ons: 12 and 8 waived, 5 stays billable.
      skillFeesPerHour: [5, 12, 8],
    });
    expect(plan.skillsCovered).toBe(2);
    expect(plan.creditPerHour).toBe(50 + 12 + 8);
  });

  it('waives nothing when the package includes no free skills', () => {
    const plan = planPackageHoursRedemption({
      baseRate: 40,
      durationMultiplier: 1,
      totalAmount: 1000,
      durationHours: 2,
      availableHours: 10,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [10, 20],
    });
    expect(plan.skillsCovered).toBe(0);
    expect(plan.creditPerHour).toBe(40);
  });

  it('scales by the duration multiplier so a discounted booking is not over-credited', () => {
    // These hours were only charged at 0.9x, so crediting the full rate back
    // would hand the parent more than the hours actually cost them.
    const plan = planPackageHoursRedemption({
      baseRate: 50,
      durationMultiplier: 0.9,
      totalAmount: 1000,
      durationHours: 4,
      availableHours: 10,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(plan.creditPerHour).toBe(45);
    expect(
      packageHoursCreditFor({
        hoursApplied: 4,
        creditPerHour: plan.creditPerHour,
        totalAmount: 1000,
      }),
    ).toBe(180);
  });

  it('spends nothing when there is no balance', () => {
    expect(
      planPackageHoursRedemption({
        baseRate: 50,
        durationMultiplier: 1,
        totalAmount: 500,
        durationHours: 4,
        availableHours: 0,
        maxSkillsAllowed: 3,
        skillFeesPerHour: [10],
      }),
    ).toEqual({ hoursToRedeem: 0, skillsCovered: 0, creditPerHour: 0 });
  });

  it('spends nothing when an hour would be worth nothing', () => {
    // A zero rate would otherwise consume hours for no credit at all.
    expect(
      planPackageHoursRedemption({
        baseRate: 0,
        durationMultiplier: 1,
        totalAmount: 500,
        durationHours: 4,
        availableHours: 10,
        maxSkillsAllowed: 0,
        skillFeesPerHour: [],
      }).hoursToRedeem,
    ).toBe(0);
  });
});

describe('resolvePackageHourValue', () => {
  /**
   * The plan sizes itself with the BEST allowance across all of a mother's
   * buckets, but FIFO may drain a bucket with a smaller one. Billing at the
   * planned rate would then waive skill fees the consumed package never
   * covered — platform money spent on an entitlement she doesn't hold. So
   * booking.service re-prices with the allowance of the buckets actually drawn
   * from, and this is the function it re-prices through.
   */
  it('values an hour at base rate plus the waived surcharges only', () => {
    expect(
      resolvePackageHourValue({
        baseRate: 50,
        durationMultiplier: 1,
        maxSkillsAllowed: 1,
        skillFeesPerHour: [20],
      }),
    ).toEqual({ creditPerHour: 70, skillsCovered: 1 });
  });

  it('drops to the bare base rate when the drawn bucket allows no free skills', () => {
    // The regression case: planned against a 3-skill bucket, but FIFO drained a
    // 0-skill one. Re-pricing must not keep waiving the 20/h add-on.
    const planned = resolvePackageHourValue({
      baseRate: 50,
      durationMultiplier: 1,
      maxSkillsAllowed: 3,
      skillFeesPerHour: [20],
    });
    const actual = resolvePackageHourValue({
      baseRate: 50,
      durationMultiplier: 1,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [20],
    });

    expect(planned.creditPerHour).toBe(70);
    expect(actual).toEqual({ creditPerHour: 50, skillsCovered: 0 });
    // Re-pricing can only ever lower the credit, so the plan's affordability
    // bound still holds after the swap.
    expect(actual.creditPerHour).toBeLessThan(planned.creditPerHour);
  });

  it('applies the duration multiplier to the waived surcharges too', () => {
    expect(
      resolvePackageHourValue({
        baseRate: 50,
        durationMultiplier: 0.9,
        maxSkillsAllowed: 1,
        skillFeesPerHour: [20],
      }).creditPerHour,
    ).toBe(63);
  });
});

describe('packageHoursCreditFor', () => {
  it('prices the hours that were actually debited, not the hours planned', () => {
    // A concurrent booking can take part of the balance between plan and redeem.
    expect(
      packageHoursCreditFor({ hoursApplied: 2, creditPerHour: 50, totalAmount: 500 }),
    ).toBe(100);
  });

  it('is zero when nothing was applied', () => {
    expect(
      packageHoursCreditFor({ hoursApplied: 0, creditPerHour: 50, totalAmount: 500 }),
    ).toBe(0);
  });

  it('still caps at the total owed as a safety net', () => {
    expect(
      packageHoursCreditFor({ hoursApplied: 10, creditPerHour: 50, totalAmount: 120 }),
    ).toBe(120);
  });
});
