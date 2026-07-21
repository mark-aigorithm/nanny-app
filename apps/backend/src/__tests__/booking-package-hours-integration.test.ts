import { Role } from '@nanny-app/shared';

/**
 * Covers the booking-service side of prepaid package hours: how createBooking
 * decides what to redeem, how the credit lands on the booking row, and how
 * cancelBooking reverses it.
 *
 * The hours ledger itself (package-hours.service) has its own unit tests and has
 * been verified against real Postgres, so it is mocked here — what this suite
 * pins is the wiring between them, which is where every money bug in this
 * feature has actually lived.
 */
jest.mock('@backend/db/prisma', () => {
  const booking = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const packagePurchase = { findMany: jest.fn() };
  const promoCode = { findFirst: jest.fn(), update: jest.fn() };
  const promoCodeRedemption = { count: jest.fn(), create: jest.fn() };
  return {
    prisma: {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      nannyProfile: { findUnique: jest.fn(), findMany: jest.fn() },
      booking,
      packagePurchase,
      promoCode,
      promoCodeRedemption,
      skill: { findMany: jest.fn() },
      durationMultiplierRule: { findMany: jest.fn() },
      // The tx client must expose every model the transaction body touches:
      // booking.create/update, the hours ledger, and promo redemption.
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({
              booking,
              packagePurchase,
              promoCode,
              promoCodeRedemption,
            })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn(),
  getStandardHourlyRate: jest.fn(),
  getRevenueSplit: jest.fn(),
  getBroadcastRadiusKm: jest.fn(),
  getPlatformConfig: jest.fn(),
  getRevealPhoneMinutes: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

jest.mock('@backend/services/package-hours.service', () => ({
  getAvailableHours: jest.fn(),
  getRedeemableSummary: jest.fn(),
  redeemPackageHours: jest.fn(),
  refundPackageHours: jest.fn(),
}));

jest.mock('@backend/services/reward.service', () => ({
  applyBookingRedemption: jest.fn(),
  awardPointsForBooking: jest.fn(),
  notifyPointsRedeemed: jest.fn(),
  notifyPointsRefunded: jest.fn(),
  refundBookingRedemption: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import {
  getBroadcastRadiusKm,
  getPlatformConfig,
  getRevealPhoneMinutes,
  getRevenueSplit,
  getServiceFeePercent,
  getStandardHourlyRate,
} from '@backend/services/app-settings.service';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import {
  getAvailableHours,
  getRedeemableSummary,
  redeemPackageHours,
  refundPackageHours,
} from '@backend/services/package-hours.service';
import {
  notifyPointsRefunded,
  refundBookingRedemption,
} from '@backend/services/reward.service';
import { cancelBooking, createBooking } from '@backend/services/booking.service';

const m = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  booking: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  packagePurchase: { findMany: jest.Mock };
  promoCode: { findFirst: jest.Mock; update: jest.Mock };
  promoCodeRedemption: { count: jest.Mock; create: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockAvailable = getAvailableHours as jest.Mock;
const mockSummary = getRedeemableSummary as jest.Mock;
const mockRedeem = redeemPackageHours as jest.Mock;
const mockRefundHours = refundPackageHours as jest.Mock;
const mockRefundPoints = refundBookingRedemption as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;
const CANCEL = { reason: 'changed plans' } as never;

const PLATFORM_CONFIG = {
  serviceFeePercent: 0,
  standardHourlyRate: 100,
  nannyPercent: 80,
  platformPercent: 20,
  maxBookingHours: 12,
  minBookingHours: 1,
  minAdvanceBookingHours: 0,
  cancellationWindowHours: 24,
  broadcastRadiusKm: 10,
  pendingWarningMinutes: 15,
  pendingCriticalMinutes: 30,
  bookingWindowStartHour: 0,
  bookingWindowEndHour: 0,
};

// 4 hours at the fixed platform rate of 100 → subtotal 400, nanny 320, platform 80.
const baseBody = { startTime: '2099-01-01T10:00:00', endTime: '2099-01-01T14:00:00' };

function bookingRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2099-01-01T10:00:00.000Z');
  return {
    id: 4,
    motherId: 10,
    mother: { firstName: 'Jane', lastName: 'Mom', avatarUrl: null },
    nannyProfileId: null,
    nannyProfile: null,
    status: 'PENDING',
    nannyDecision: 'PENDING',
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: start,
    startTime: start,
    endTime: new Date('2099-01-01T14:00:00.000Z'),
    durationHours: 4,
    baseRate: 100,
    effectiveHourlyRate: 100,
    selectedSkillFees: [],
    subtotal: 400,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 400,
    nannyAmount: 320,
    platformAmount: 80,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    startPinExpiresAt: null,
    payments: [],
    review: null,
    createdAt: start,
    ...overrides,
  };
}

/**
 * cancelBooking runs two reversals in sequence, each rewriting the money fields
 * from ABSOLUTE values read off the row it was handed. Modelling the row as
 * accumulating writes is load-bearing here: rebuilding it from defaults on every
 * update would hide exactly the clobber these tests exist to catch.
 */
let currentBooking: Record<string, unknown>;

function setBooking(overrides: Record<string, unknown> = {}) {
  currentBooking = bookingRow(overrides);
  m.booking.findUnique.mockResolvedValue(currentBooking);
  m.booking.create.mockResolvedValue(currentBooking);
  return currentBooking;
}

/** The `data` from the booking.update that wrote the package credit, if any. */
function creditUpdate() {
  return m.booking.update.mock.calls.find(
    (c) => c[0]?.data?.packageHoursApplied !== undefined,
  )?.[0]?.data;
}

/** The `data` from the booking.update that reversed Care Points, if any. */
function pointsUpdate() {
  return m.booking.update.mock.calls.find(
    (c) => c[0]?.data?.rewardCreditAmount !== undefined,
  )?.[0]?.data;
}

beforeEach(() => {
  jest.clearAllMocks();
  m.user.findUnique.mockResolvedValue({ id: 10, role: Role.MOTHER, deletedAt: null });
  m.user.findMany.mockResolvedValue([]);
  m.nannyProfile.findMany.mockResolvedValue([]);
  m.booking.findFirst.mockResolvedValue(null);
  setBooking();
  m.booking.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    currentBooking = { ...currentBooking, ...data };
    return currentBooking;
  });
  m.skill.findMany.mockResolvedValue([]);
  m.durationMultiplierRule.findMany.mockResolvedValue([]);
  (getServiceFeePercent as jest.Mock).mockResolvedValue(0);
  (getStandardHourlyRate as jest.Mock).mockResolvedValue(100);
  (getRevenueSplit as jest.Mock).mockResolvedValue({ nannyPercent: 80, platformPercent: 20 });
  (getBroadcastRadiusKm as jest.Mock).mockResolvedValue(10);
  (getPlatformConfig as jest.Mock).mockResolvedValue(PLATFORM_CONFIG);
  (getRevealPhoneMinutes as jest.Mock).mockResolvedValue(60);
  (createInAppNotification as jest.Mock).mockResolvedValue({});
  (dispatchPush as jest.Mock).mockResolvedValue(undefined);
  (notifyPointsRefunded as jest.Mock).mockResolvedValue(undefined);
  mockRefundPoints.mockResolvedValue(undefined);
});

describe('createBooking — applying prepaid package hours', () => {
  it('skips the transactional path entirely when the mother holds no hours', async () => {
    mockAvailable.mockResolvedValue(0);

    await createBooking(DECODED, baseBody as never);

    expect(m.$transaction).not.toHaveBeenCalled();
    expect(mockRedeem).not.toHaveBeenCalled();
    expect(m.booking.create).toHaveBeenCalled();
  });

  it('does not touch the balance when the mother opts out', async () => {
    mockAvailable.mockResolvedValue(10);

    await createBooking(DECODED, { ...baseBody, usePackageHours: false } as never);

    expect(mockAvailable).not.toHaveBeenCalled();
    expect(mockRedeem).not.toHaveBeenCalled();
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('credits the booking and leaves the nanny paid in full', async () => {
    mockAvailable.mockResolvedValue(10);
    mockSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 4, maxSkillsAllowed: 0, purchaseIds: [1] });

    await createBooking(DECODED, baseBody as never);

    const data = creditUpdate();
    expect(data).toBeDefined();
    // 4h × 100 = 400 credited against a 400 total.
    expect(data.packageHoursApplied).toBe(4);
    expect(data.packageCreditAmount).toBe(400);
    expect(data.discountAmount).toBe(400);
    expect(data.totalAmount).toBe(0);
    // The platform funds it; the nanny's earnings are never touched.
    expect(data.platformAmount).toBe(80 - 400);
    expect(data.nannyAmount).toBeUndefined();
  });

  it('asks the ledger for only the hours the booking needs', async () => {
    mockAvailable.mockResolvedValue(10);
    mockSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 4, maxSkillsAllowed: 0, purchaseIds: [1] });

    await createBooking(DECODED, baseBody as never);

    expect(mockRedeem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 10, bookingId: 4, hoursNeeded: 4 }),
    );
  });

  it('spends only the hours a promo-reduced total can pay for', async () => {
    // REGRESSION: hours were once debited for the full duration and the credit
    // capped afterwards, silently burning the difference. A 50%-off promo on a
    // 400 booking leaves 200 owed, worth 2h at 100/h — not 4.
    mockAvailable.mockResolvedValue(10);
    mockSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 2, maxSkillsAllowed: 0, purchaseIds: [1] });
    m.promoCode.findFirst.mockResolvedValue({
      id: 23,
      code: 'HALF',
      discountType: 'PERCENTAGE',
      value: 50,
      maxUsage: null,
      maxUsagePerUser: null,
      usageCount: 0,
      isActive: true,
      expiresAt: null,
      deletedAt: null,
    });
    m.promoCodeRedemption.count.mockResolvedValue(0);
    setBooking({ discountAmount: 200, totalAmount: 200 });

    await createBooking(DECODED, { ...baseBody, promoCode: 'HALF' } as never);

    expect(mockRedeem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hoursNeeded: 2 }),
    );
    const data = creditUpdate();
    expect(data.packageHoursApplied).toBe(2);
    expect(data.packageCreditAmount).toBe(200);
    expect(data.totalAmount).toBe(0);
  });

  it('prices the free-skill waiver off the bucket actually drawn from', async () => {
    // REGRESSION: the allowance was briefly taken from the BEST bucket the
    // mother held rather than the one FIFO drained. Here the plan sees a
    // 3-skill bucket but the debit came from a 0-skill one, so the 25/h add-on
    // must stay billable instead of being waived out of platformAmount.
    m.skill.findMany.mockResolvedValue([
      { id: 3, name: 'French speaker', feeType: 'FLAT', feeValue: 25, isActive: true, deletedAt: null },
    ]);
    setBooking({
      effectiveHourlyRate: 125,
      subtotal: 500,
      totalAmount: 500,
      nannyAmount: 400,
      platformAmount: 100,
      selectedSkillFees: [
        { id: 3, name: 'French speaker', feeType: 'FLAT', feeValue: 25, amountPerHour: 25 },
      ],
    });
    mockAvailable.mockResolvedValue(10);
    mockSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 3 });
    mockRedeem.mockResolvedValue({ hoursApplied: 4, maxSkillsAllowed: 0, purchaseIds: [1] });

    await createBooking(DECODED, { ...baseBody, skillIds: [3] } as never);

    const data = creditUpdate();
    expect(data.packageSkillsCovered).toBe(0);
    // 4h × 100 base only. Had the planned 3-skill allowance been used it would
    // have been 4 × 125 = 500, waiving a fee this package never covered.
    expect(data.packageCreditAmount).toBe(400);
  });

  it('records nothing when the ledger had nothing left to give', async () => {
    mockAvailable.mockResolvedValue(2);
    mockSummary.mockResolvedValue({ availableHours: 2, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 0, maxSkillsAllowed: 0, purchaseIds: [] });

    await createBooking(DECODED, baseBody as never);

    expect(creditUpdate()).toBeUndefined();
  });
});

describe('cancelBooking — reversing prepaid package hours', () => {
  it('returns the hours and undoes the credit on the booking', async () => {
    setBooking({
      status: 'APPROVED',
      discountAmount: 400,
      totalAmount: 0,
      platformAmount: -320,
      packageHoursApplied: 4,
      packageCreditAmount: 400,
    });
    mockRefundHours.mockResolvedValue(4);

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundHours).toHaveBeenCalledWith(expect.anything(), 4);
    const data = creditUpdate();
    expect(data.discountAmount).toBe(0);
    expect(data.totalAmount).toBe(400);
    expect(data.platformAmount).toBe(80);
    expect(data.packageHoursApplied).toBe(0);
    expect(data.packageCreditAmount).toBe(0);
  });

  it('leaves a paid booking alone — the hours stay spent', async () => {
    setBooking({ status: 'CONFIRMED', packageHoursApplied: 4, packageCreditAmount: 400 });

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundHours).not.toHaveBeenCalled();
    expect(creditUpdate()).toBeUndefined();
  });

  it('does nothing when no hours were applied', async () => {
    setBooking({ status: 'APPROVED' });

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundHours).not.toHaveBeenCalled();
  });

  it('applies BOTH reversals when a booking carries points and package hours', async () => {
    // REGRESSION: both helpers rewrite the money fields from ABSOLUTE values
    // read off the booking they are handed, so handing both the same stale
    // snapshot silently discarded one reversal. Start from a 400 booking with
    // 100 of Care Points and 400 of package credit already applied.
    setBooking({
      status: 'APPROVED',
      discountAmount: 500,
      totalAmount: 0,
      platformAmount: -420,
      rewardCreditPoints: 50,
      rewardCreditAmount: 100,
      rewardCreditHoursApplied: 1,
      packageHoursApplied: 4,
      packageCreditAmount: 400,
    });
    mockRefundHours.mockResolvedValue(4);

    await cancelBooking(DECODED, 4, CANCEL);

    // Points reversal runs first, off the original row: 500−100, 0+100, −420+100.
    expect(pointsUpdate()).toMatchObject({
      discountAmount: 400,
      totalAmount: 100,
      platformAmount: -320,
      rewardCreditAmount: 0,
    });
    // The hours reversal must build on THAT result. From the stale snapshot it
    // would have written 100 / 400 / −20, losing the points reversal entirely.
    expect(creditUpdate()).toMatchObject({
      discountAmount: 0,
      totalAmount: 500,
      platformAmount: 80,
      packageHoursApplied: 0,
      packageCreditAmount: 0,
    });
  });

  it('still cancels when the hours ledger fails', async () => {
    setBooking({ status: 'APPROVED', packageHoursApplied: 4, packageCreditAmount: 400 });
    mockRefundHours.mockRejectedValue(new Error('ledger unavailable'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await cancelBooking(DECODED, 4, CANCEL);

    expect(res.booking.status).toBe('CANCELLED');
    expect(errSpy).toHaveBeenCalledWith(
      '[packages] failed to refund package hours on cancel',
      expect.objectContaining({ bookingId: 4 }),
    );
    errSpy.mockRestore();
  });
});
