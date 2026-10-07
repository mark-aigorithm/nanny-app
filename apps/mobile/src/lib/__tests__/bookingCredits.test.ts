import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';

import { planBookingCredits, type BookingCreditsInput } from '@mobile/lib/bookingCredits';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function bucket(overrides: Partial<PackagePurchase> = {}): PackagePurchase {
  return {
    id: 1,
    packageId: 1,
    packageName: 'Starter Pack',
    hoursPurchased: 20,
    hoursRemaining: 18,
    maxSkills: 0,
    status: 'ACTIVE',
    purchasedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function balance(buckets: PackagePurchase[]): PackageHoursBalance {
  return { availableHours: buckets.reduce((s, b) => s + b.hoursRemaining, 0), buckets };
}

/**
 * The booking from the bug report: 4h at EGP 400/h with a 10% longer-booking
 * discount → EGP 1,440 owed; each hour is worth 360 of package credit and 400
 * of Care Points (points buy hours at the undiscounted rate).
 */
function input(overrides: Partial<BookingCreditsInput> = {}): BookingCreditsInput {
  return {
    baseRate: 400,
    effectiveHourlyRate: 400,
    durationMultiplier: 0.9,
    durationHours: 4,
    totalAmount: 1440,
    skillFeesPerHour: [],
    packageBalance: balance([bucket()]),
    pointsBalance: 227,
    rewardConfig: { enabled: true, redemptionPointsPerHour: 100, minRedemptionPoints: 100 },
    pointsHours: 0,
    now: NOW,
    ...overrides,
  };
}

describe('planBookingCredits — package first', () => {
  it('lets a package that holds enough hours cover the whole booking', () => {
    const plan = planBookingCredits(input());

    expect(plan.package).toEqual({
      hoursApplied: 4,
      creditAmount: 1440,
      availableHours: 18,
      hoursLeftAfter: 14,
      packageName: 'Starter Pack',
    });
    expect(plan.afterPackageTotal).toBe(0);
    expect(plan.netTotal).toBe(0);
  });

  it('says points are not needed when the package covers everything', () => {
    const plan = planBookingCredits(input({ pointsHours: 2 }));

    expect(plan.points.status).toBe('not-needed');
    expect(plan.points.maxHours).toBe(0);
    // A choice left over from before can never be charged.
    expect(plan.points.hoursApplied).toBe(0);
    expect(plan.points.saving).toBe(0);
  });

  it('lets points cover only the hours the package leaves owed', () => {
    // 2 package hours of 4 → 720 left, i.e. 2 point-hours at 400 (capped at 720).
    const plan = planBookingCredits(
      input({ packageBalance: balance([bucket({ hoursRemaining: 2 })]), pointsBalance: 500, pointsHours: 2 }),
    );

    expect(plan.package?.hoursApplied).toBe(2);
    expect(plan.afterPackageTotal).toBe(720);
    expect(plan.points.status).toBe('available');
    expect(plan.points.maxHours).toBe(2);
    expect(plan.points.hoursApplied).toBe(2);
    expect(plan.points.saving).toBe(720);
    expect(plan.netTotal).toBe(0);
  });

  it('trims a stale points choice down to the hours still owed', () => {
    const plan = planBookingCredits(
      input({ packageBalance: balance([bucket({ hoursRemaining: 3 })]), pointsBalance: 500, pointsHours: 4 }),
    );

    expect(plan.points.maxHours).toBe(1);
    expect(plan.points.hoursApplied).toBe(1);
    expect(plan.points.saving).toBe(360);
    expect(plan.netTotal).toBe(0);
  });

  it('caps points at the wallet when the wallet is the tighter limit', () => {
    const plan = planBookingCredits(input({ packageBalance: balance([]), pointsBalance: 227 }));

    expect(plan.package).toBeNull();
    expect(plan.points.maxHours).toBe(2);
    expect(plan.netTotal).toBe(1440);
  });

  it('reports a wallet too small for the minimum redemption', () => {
    const plan = planBookingCredits(input({ packageBalance: balance([]), pointsBalance: 50 }));
    expect(plan.points.status).toBe('insufficient');
  });

  it('reports the programme switched off', () => {
    const plan = planBookingCredits(
      input({
        packageBalance: balance([]),
        rewardConfig: { enabled: false, redemptionPointsPerHour: 100, minRedemptionPoints: 100 },
      }),
    );
    expect(plan.points.status).toBe('unavailable');
  });

  it('snaps a choice inside the minimum-redemption dead zone back to none', () => {
    // A 200-point minimum means 1 point-hour is not allowed on its own.
    const plan = planBookingCredits(
      input({
        packageBalance: balance([bucket({ hoursRemaining: 3 })]),
        pointsBalance: 500,
        pointsHours: 1,
        rewardConfig: { enabled: true, redemptionPointsPerHour: 100, minRedemptionPoints: 200 },
      }),
    );
    // Only one hour is owed, and that is below the minimum — points can't help.
    expect(plan.points.status).toBe('insufficient');
    expect(plan.points.hoursApplied).toBe(0);
  });

  it('ignores expired, used-up and unpaid packages', () => {
    const plan = planBookingCredits(
      input({
        packageBalance: balance([
          bucket({ id: 1, expiresAt: '2026-10-01T00:00:00.000Z' }),
          bucket({ id: 2, hoursRemaining: 0 }),
          bucket({ id: 3, status: 'PENDING_PAYMENT' }),
        ]),
      }),
    );
    expect(plan.package).toBeNull();
    expect(plan.netTotal).toBe(1440);
  });

  it('takes no package hours for a booking a promo already made free', () => {
    const plan = planBookingCredits(input({ totalAmount: 0 }));
    expect(plan.package).toBeNull();
    expect(plan.points.status).toBe('not-needed');
  });

  it('tolerates a balance without a bucket list (older cache entries)', () => {
    const plan = planBookingCredits(
      input({ packageBalance: { availableHours: 0 } as unknown as PackageHoursBalance }),
    );
    expect(plan.package).toBeNull();
  });
});
