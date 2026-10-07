import {
  pointHoursToCover,
  previewPackageHours,
  type PackageHoursBalance,
  type RewardConfig,
} from '@nanny-app/shared';

import { usablePackages } from '@mobile/lib/currentPackage';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type BookingCreditsInput = {
  baseRate: number;
  /** Base rate plus skill and extra-child fees — what one Care Points hour is worth. */
  effectiveHourlyRate: number;
  durationMultiplier: number;
  durationHours: number;
  /** What is owed after the promo, before any package hours or points. */
  totalAmount: number;
  skillFeesPerHour: number[];
  packageBalance: PackageHoursBalance | undefined;
  pointsBalance: number;
  rewardConfig: Pick<RewardConfig, 'enabled' | 'redemptionPointsPerHour' | 'minRedemptionPoints'> | undefined;
  /** The Care Points hours she has chosen on the stepper. */
  pointsHours: number;
  now?: Date;
};

/**
 * - `available`: she can redeem between `minHours` and `maxHours`.
 * - `not-needed`: nothing is left to pay once the package (or promo) is applied.
 * - `insufficient`: her balance — or what is still owed — is below one redemption.
 * - `unavailable`: the programme is off.
 */
export type PointsStatus = 'available' | 'not-needed' | 'insufficient' | 'unavailable';

export type BookingCreditsPlan = {
  /** Package hours this booking will use, or null when none apply. */
  package: {
    hoursApplied: number;
    creditAmount: number;
    availableHours: number;
    hoursLeftAfter: number;
    packageName: string;
  } | null;
  /** Still owed once the package is applied — the most points can cover. */
  afterPackageTotal: number;
  points: {
    status: PointsStatus;
    perHour: number;
    minHours: number;
    maxHours: number;
    /** The stepper choice after trimming to what is allowed right now. */
    hoursApplied: number;
    saving: number;
  };
  /** What she will pay once every credit is applied. */
  netTotal: number;
};

/**
 * Works out how a booking will be paid for, in the order the server applies
 * credits: promo → prepaid package hours (always, whenever she holds a usable
 * package) → Care Points for whatever the package leaves owed → card.
 *
 * The package numbers come from the shared `previewPackageHours`, the same
 * maths the backend runs at creation, and the points cap from the shared
 * `pointHoursToCover`, the same cap `applyBookingRedemption` enforces — so what
 * the review screen shows is what the request will actually cost.
 */
export function planBookingCredits(input: BookingCreditsInput): BookingCreditsPlan {
  const buckets = input.packageBalance?.buckets
    ? usablePackages(input.packageBalance, input.now)
    : [];

  const preview = previewPackageHours({
    baseRate: input.baseRate,
    durationMultiplier: input.durationMultiplier,
    totalAmount: input.totalAmount,
    durationHours: input.durationHours,
    buckets: buckets.map((b) => ({ hoursRemaining: b.hoursRemaining, maxSkills: b.maxSkills })),
    skillFeesPerHour: input.skillFeesPerHour,
  });

  const availableHours = round2(buckets.reduce((sum, b) => sum + b.hoursRemaining, 0));
  const pkg =
    preview.hoursApplied > 0 && buckets[0]
      ? {
          hoursApplied: preview.hoursApplied,
          creditAmount: preview.creditAmount,
          availableHours,
          hoursLeftAfter: round2(availableHours - preview.hoursApplied),
          packageName: buckets[0].packageName,
        }
      : null;

  const afterPackageTotal = Math.max(0, round2(input.totalAmount - preview.creditAmount));

  const config = input.rewardConfig;
  const perHour = config?.redemptionPointsPerHour ?? 0;
  const minHours =
    perHour > 0 ? Math.max(1, Math.ceil((config?.minRedemptionPoints ?? 0) / perHour)) : 1;
  const maxHours =
    perHour > 0
      ? Math.min(
          Math.floor(input.pointsBalance / perHour),
          Math.floor(input.durationHours),
          pointHoursToCover(afterPackageTotal, input.effectiveHourlyRate),
        )
      : 0;

  let status: PointsStatus;
  if (!config?.enabled || perHour <= 0) status = 'unavailable';
  else if (afterPackageTotal <= 0) status = 'not-needed';
  else if (maxHours < minHours) status = 'insufficient';
  else status = 'available';

  const chosen = Math.min(Math.max(0, Math.floor(input.pointsHours)), maxHours);
  const hoursApplied = status === 'available' && chosen >= minHours ? chosen : 0;
  const saving = Math.min(round2(hoursApplied * input.effectiveHourlyRate), afterPackageTotal);

  return {
    package: pkg,
    afterPackageTotal,
    points: {
      status,
      perHour,
      minHours,
      maxHours: status === 'available' ? maxHours : 0,
      hoursApplied,
      saving,
    },
    netTotal: Math.max(0, round2(afterPackageTotal - saving)),
  };
}
