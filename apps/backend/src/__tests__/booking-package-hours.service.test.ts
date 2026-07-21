import { computePackageHoursCredit } from '@nanny-app/shared';

/**
 * Pins how prepaid package hours are turned into money on a booking.
 *
 * This is the arithmetic `applyPackageHoursToBooking` (booking.service) relies
 * on, and the part that can silently over- or under-credit a parent, so it is
 * exercised directly rather than through createBooking's full dependency graph.
 */
describe('computePackageHoursCredit', () => {
  it('values covered hours at the base rate when no skills are selected', () => {
    const { credit, skillsCovered } = computePackageHoursCredit({
      baseRate: 50,
      durationMultiplier: 1,
      totalAmount: 500,
      hoursApplied: 4,
      maxSkillsAllowed: 2,
      skillFeesPerHour: [],
    });
    expect(credit).toBe(200);
    // An allowance of 2 with nothing selected covers nothing.
    expect(skillsCovered).toBe(0);
  });

  it('waives the most expensive skills first, up to the allowance', () => {
    const { credit, skillsCovered } = computePackageHoursCredit({
      baseRate: 50,
      durationMultiplier: 1,
      totalAmount: 1000,
      hoursApplied: 3,
      maxSkillsAllowed: 2,
      // Allowance of 2 against three add-ons: 12 and 8 are waived, 5 stays billable.
      skillFeesPerHour: [5, 12, 8],
    });
    expect(skillsCovered).toBe(2);
    expect(credit).toBe((50 + 12 + 8) * 3);
  });

  it('scales by the duration multiplier so a discounted booking is not over-credited', () => {
    // These hours were only charged at 0.9x, so crediting the full rate back
    // would hand the mother more than the hours actually cost her.
    const { credit } = computePackageHoursCredit({
      baseRate: 50,
      durationMultiplier: 0.9,
      totalAmount: 1000,
      hoursApplied: 4,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(credit).toBe(180);
    expect(credit).toBeLessThan(50 * 4);
  });

  it('never credits more than the total still owed', () => {
    const { credit } = computePackageHoursCredit({
      baseRate: 50,
      durationMultiplier: 1,
      // A promo already pulled the total below the raw value of the hours.
      totalAmount: 120,
      hoursApplied: 6,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(credit).toBe(120);
  });

  it('covers only the skills actually selected when the allowance exceeds them', () => {
    const { credit, skillsCovered } = computePackageHoursCredit({
      baseRate: 40,
      durationMultiplier: 1,
      totalAmount: 1000,
      hoursApplied: 2,
      maxSkillsAllowed: 5,
      skillFeesPerHour: [10],
    });
    expect(skillsCovered).toBe(1);
    expect(credit).toBe((40 + 10) * 2);
  });

  it('waives nothing when the package includes no free skills', () => {
    const { credit, skillsCovered } = computePackageHoursCredit({
      baseRate: 40,
      durationMultiplier: 1,
      totalAmount: 1000,
      hoursApplied: 2,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [10, 20],
    });
    expect(skillsCovered).toBe(0);
    // Base rate only — both add-ons stay billable.
    expect(credit).toBe(80);
  });

  it('handles partial coverage when fewer hours are left than the booking runs', () => {
    // A 6-hour booking with only 2.5 prepaid hours left; the rest stays payable.
    const { credit } = computePackageHoursCredit({
      baseRate: 60,
      durationMultiplier: 1,
      totalAmount: 360,
      hoursApplied: 2.5,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(credit).toBe(150);
    expect(credit).toBeLessThan(360);
  });

  it('is a no-op when no hours were applied', () => {
    expect(
      computePackageHoursCredit({
        baseRate: 50,
        durationMultiplier: 1,
        totalAmount: 500,
        hoursApplied: 0,
        maxSkillsAllowed: 3,
        skillFeesPerHour: [10],
      }),
    ).toEqual({ credit: 0, skillsCovered: 0 });
  });

  it('rounds to 2 decimals so fractional hours cannot drift the balance', () => {
    const { credit } = computePackageHoursCredit({
      baseRate: 33.33,
      durationMultiplier: 1,
      totalAmount: 1000,
      hoursApplied: 1.5,
      maxSkillsAllowed: 0,
      skillFeesPerHour: [],
    });
    expect(credit).toBe(50);
    expect(Number.isInteger(Math.round(credit * 100))).toBe(true);
  });
});
