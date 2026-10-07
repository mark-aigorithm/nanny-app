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
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  };
  const packagePurchase = { findMany: jest.fn() };
  const promoCode = { findFirst: jest.fn(), update: jest.fn() };
  const promoCodeRedemption = { count: jest.fn(), create: jest.fn() };
  return {
    prisma: {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      address: { findFirst: jest.fn() },
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
  getSkillMatchingEnabled: jest.fn().mockResolvedValue(true),
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

jest.mock('@backend/services/paymob.service', () => ({
  confirmBookingIfNothingOwed: jest.fn().mockResolvedValue(null),
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
  applyBookingRedemption,
  notifyPointsRefunded,
  refundBookingRedemption,
} from '@backend/services/reward.service';
import { confirmBookingIfNothingOwed } from '@backend/services/paymob.service';
import {
  cancelBooking,
  createBooking,
  redeemBookingPoints,
} from '@backend/services/booking.service';


/** The address the mother books at; createBooking looks it up and snapshots it. */
const HOME_ADDRESS = {
  id: 7,
  userId: 10,
  label: 'Home',
  formattedAddress: '1 Test Street, Cairo',
  governorate: null,
  area: null,
  street: null,
  building: null,
  floor: null,
  apartment: null,
  landmark: null,
  latitude: 30.0444,
  longitude: 31.2357,
  isDefault: true,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

const m = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  address: { findFirst: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  booking: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
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
const mockSpendPoints = applyBookingRedemption as jest.Mock;

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
  cancellationFeePercent: 50,
  broadcastRadiusKm: 10,
  pendingWarningMinutes: 15,
  pendingCriticalMinutes: 30,
  includedChildrenPerBooking: 2,
  maxChildrenPerBooking: 4,
  extraChildFeeType: 'FLAT' as const,
  extraChildFeeValue: 30,
  bookingWindowStartHour: 0,
  bookingWindowEndHour: 0,
};

// 4 hours at the fixed platform rate of 100 → subtotal 400, nanny 320, platform 80.
// One child, so the extra-child fee adds nothing and these assertions keep
// testing only the package-hours math.
const baseBody = {
  startTime: '2099-01-01T10:00:00',
  endTime: '2099-01-01T14:00:00',
  children: [{ name: null, ageYears: 4 }],
  addressId: HOME_ADDRESS.id,
};

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
    childrenCount: 1,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    bookedChildren: [{ name: null, ageYears: 4 }],
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
    // Matches bookingInclude: the relation is always present, empty by default.
    extensions: [],
    adjustments: [],
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

type Where = Record<string, unknown>;
type Data = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'id' || key === 'deletedAt') return true;
    const value = row[key];
    if (cond && typeof cond === 'object') {
      const c = cond as { in?: unknown[]; gt?: number };
      if (c.in) return c.in.includes(value);
      if (c.gt !== undefined) return Number(value) > c.gt;
    }
    return value === cond;
  });
}

function applied(row: Record<string, unknown>, data: Data): Record<string, unknown> {
  const next = { ...row };
  for (const [key, change] of Object.entries(data)) {
    if (change && typeof change === 'object') {
      const c = change as { increment?: number; decrement?: number };
      if (c.increment !== undefined) next[key] = Number(row[key]) + c.increment;
      if (c.decrement !== undefined) next[key] = Number(row[key]) - c.decrement;
    } else {
      next[key] = change;
    }
  }
  return next;
}

/**
 * Stand in for Postgres on the conditional reversal writes: an updateMany
 * matches the row as it is NOW (not as the service read it) and applies its
 * increments to it, so a test sees the booking the database would hold.
 */
function writeThroughConditionalUpdates() {
  m.booking.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Data }) => {
    if (!matches(currentBooking, where)) return { count: 0 };
    currentBooking = applied(currentBooking, data);
    m.booking.findUnique.mockResolvedValue(currentBooking);
    return { count: 1 };
  });
  m.booking.findUniqueOrThrow.mockImplementation(async () => currentBooking);
}

/** The `data` from the booking.update that wrote the package credit, if any. */
function creditUpdate() {
  return m.booking.update.mock.calls.find(
    (c) => c[0]?.data?.packageHoursApplied !== undefined,
  )?.[0]?.data;
}


beforeEach(() => {
  jest.clearAllMocks();
  writeThroughConditionalUpdates();
  m.address.findFirst.mockResolvedValue(HOME_ADDRESS);
  m.user.findUnique.mockResolvedValue({
    id: 10,
    role: Role.MOTHER,
    deletedAt: null,
    // Bookings are gated on a verified address; these tests are about hours.
    isEmailVerified: true,
  });
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

  it('spends package hours first even when an old client asks to skip them', async () => {
    // Older builds could send usePackageHours: false. The rule is now that a
    // valid package is always used first, so the flag no longer opts out.
    mockAvailable.mockResolvedValue(10);
    mockSummary.mockResolvedValue({ availableHours: 10, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 4, maxSkillsAllowed: 0, purchaseIds: [1] });

    await createBooking(DECODED, { ...baseBody, usePackageHours: false } as never);

    expect(mockRedeem).toHaveBeenCalled();
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
      expect.objectContaining({ userId: 10, scope: { bookingId: 4 }, hoursNeeded: 4 }),
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

describe('createBooking — Care Points chosen with the request', () => {
  beforeEach(() => mockAvailable.mockResolvedValue(0));

  it('spends them when the request is created, so a covered request owes nothing', async () => {
    setBooking({ status: 'PENDING', totalAmount: 400, discountAmount: 0, platformAmount: 80 });
    mockSpendPoints.mockResolvedValue({ hours: 4, pointsCost: 400, discount: 400 });

    await createBooking(DECODED, { ...baseBody, redeemPointsHours: 4 } as never);

    // Inside the creation transaction, against the new booking.
    expect(m.$transaction).toHaveBeenCalled();
    expect(mockSpendPoints).toHaveBeenCalledWith(expect.anything(), {
      userId: 10,
      scope: { bookingId: 4 },
      redeemHours: 4,
      perHour: 100,
      durationHours: 4,
      owedAmount: 400,
    });
    // Written only against the row as read: same status, same total, no points yet.
    expect(m.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING', totalAmount: 400, rewardCreditPoints: 0 }),
      }),
    );
    expect(currentBooking).toMatchObject({
      totalAmount: 0,
      discountAmount: 400,
      platformAmount: -320,
      rewardCreditPoints: 400,
      rewardCreditAmount: 400,
    });
  });

  it('spends package hours first and lets points pay only what they leave owed', async () => {
    // 2 package hours on a 4h booking at 100/h leave 200 owed.
    mockAvailable.mockResolvedValue(2);
    mockSummary.mockResolvedValue({ availableHours: 2, maxSkillsAllowed: 0 });
    mockRedeem.mockResolvedValue({ hoursApplied: 2, maxSkillsAllowed: 0, purchaseIds: [1] });
    setBooking({ status: 'PENDING', totalAmount: 400, discountAmount: 0, platformAmount: 80 });
    mockSpendPoints.mockResolvedValue({ hours: 2, pointsCost: 200, discount: 200 });

    await createBooking(DECODED, { ...baseBody, redeemPointsHours: 4 } as never);

    // Package before points, and the points told what is really still owed.
    expect(mockRedeem.mock.invocationCallOrder[0]!).toBeLessThan(
      mockSpendPoints.mock.invocationCallOrder[0]!,
    );
    expect(mockSpendPoints).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ redeemHours: 4, owedAmount: 200 }),
    );
  });

  it('never takes points for a request that already owes nothing', async () => {
    // A 100% promo left nothing for the points to cover.
    setBooking({ status: 'PENDING', totalAmount: 0, discountAmount: 400 });

    await createBooking(DECODED, { ...baseBody, redeemPointsHours: 4 } as never);

    expect(mockSpendPoints).not.toHaveBeenCalled();
  });

  it('refuses the request when her points no longer cover what she chose', async () => {
    setBooking({ status: 'PENDING', totalAmount: 400 });
    mockSpendPoints.mockRejectedValue(
      Object.assign(new Error('You do not have enough Care Points for this redemption.'), { statusCode: 400 }),
    );

    await expect(
      createBooking(DECODED, { ...baseBody, redeemPointsHours: 4 } as never),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('gives them back when the request is cancelled before a nanny accepts', async () => {
    setBooking({
      status: 'PENDING',
      totalAmount: 0,
      discountAmount: 400,
      platformAmount: -320,
      rewardCreditPoints: 400,
      rewardCreditAmount: 400,
      rewardCreditHoursApplied: 4,
    });

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundPoints).toHaveBeenCalledWith(expect.anything(), {
      userId: 10,
      scope: { bookingId: 4 },
      points: 400,
    });
    expect(currentBooking).toMatchObject({ totalAmount: 400, discountAmount: 0, rewardCreditPoints: 0 });
  });
});

describe('redeemBookingPoints — points applied after a nanny accepted (older app builds)', () => {
  it('confirms the booking on the spot when the points cover the rest', async () => {
    setBooking({ status: 'APPROVED', nannyProfileId: 19, totalAmount: 400, platformAmount: 80 });
    mockSpendPoints.mockResolvedValue({ hours: 4, pointsCost: 400, discount: 400 });
    (confirmBookingIfNothingOwed as jest.Mock).mockResolvedValueOnce(
      bookingRow({ status: 'CONFIRMED', nannyProfileId: 19, totalAmount: 0 }),
    );

    const result = await redeemBookingPoints(DECODED, 4, { hours: 4 });

    expect(confirmBookingIfNothingOwed).toHaveBeenCalledWith(4);
    expect(result.status).toBe('CONFIRMED');
  });

  it('leaves it payable when money is still owed', async () => {
    setBooking({ status: 'APPROVED', nannyProfileId: 19, totalAmount: 400, platformAmount: 80 });
    mockSpendPoints.mockResolvedValue({ hours: 1, pointsCost: 100, discount: 100 });

    const result = await redeemBookingPoints(DECODED, 4, { hours: 1 });

    expect(result.status).toBe('APPROVED');
    expect(result.totalAmount).toBe(300);
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

    expect(mockRefundHours).toHaveBeenCalledWith(expect.anything(), { bookingId: 4 });
    expect(currentBooking).toMatchObject({
      discountAmount: 0,
      totalAmount: 400,
      platformAmount: 80,
      packageHoursApplied: 0,
      packageCreditAmount: 0,
    });
  });

  it('leaves a paid booking alone — the hours stay spent', async () => {
    setBooking({ status: 'CONFIRMED', packageHoursApplied: 4, packageCreditAmount: 400 });

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundHours).not.toHaveBeenCalled();
    expect(m.booking.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when no hours were applied', async () => {
    setBooking({ status: 'APPROVED' });

    await cancelBooking(DECODED, 4, CANCEL);

    expect(mockRefundHours).not.toHaveBeenCalled();
  });

  it('keeps the hours spent when the booking was confirmed after it was read', async () => {
    // Read as APPROVED; by the time the reversal writes, a confirm has landed.
    setBooking({ status: 'APPROVED', totalAmount: 0, packageHoursApplied: 4, packageCreditAmount: 400 });
    m.booking.updateMany.mockImplementation(async ({ where }: { where: Where }) =>
      matches({ ...currentBooking, status: 'CONFIRMED' }, where) ? { count: 1 } : { count: 0 },
    );

    await cancelBooking(DECODED, 4, CANCEL);

    expect(m.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['PENDING', 'APPROVED'] } }),
      }),
    );
    expect(mockRefundHours).not.toHaveBeenCalled();
  });

  it('keeps the Care Points spent when the booking was confirmed after it was read', async () => {
    setBooking({
      status: 'APPROVED',
      totalAmount: 0,
      rewardCreditPoints: 50,
      rewardCreditAmount: 400,
      rewardCreditHoursApplied: 4,
    });
    m.booking.updateMany.mockImplementation(async ({ where }: { where: Where }) =>
      matches({ ...currentBooking, status: 'CONFIRMED' }, where) ? { count: 1 } : { count: 0 },
    );

    await cancelBooking(DECODED, 4, CANCEL);

    expect(m.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'APPROVED'] },
          rewardCreditPoints: 50,
        }),
      }),
    );
    expect(mockRefundPoints).not.toHaveBeenCalled();
  });

  it('applies BOTH reversals when a booking carries points and package hours', async () => {
    // REGRESSION: the two reversals once rewrote the money fields from values
    // read off one stale snapshot, so the second silently discarded the first.
    // Start from a 400 booking with 100 of Care Points and 400 of package credit.
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

    expect(mockRefundPoints).toHaveBeenCalled();
    expect(mockRefundHours).toHaveBeenCalled();
    expect(currentBooking).toMatchObject({
      discountAmount: 0,
      totalAmount: 500,
      platformAmount: 80,
      rewardCreditAmount: 0,
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
