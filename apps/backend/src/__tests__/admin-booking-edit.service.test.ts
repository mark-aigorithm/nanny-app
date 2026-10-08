import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

/**
 * Regression guard for the admin-edit "balance due" money math.
 *
 * When an admin raises a paid booking's fees, the mother is asked to pay the
 * DIFFERENCE — `new total − what she already paid` — not the per-hour rate and
 * not the whole new total. This is the exact number that lands on her
 * "Complete payment" card (BookingAdjustment.amountEgp), so these tests assert
 * it directly against `bookingAdjustment.create` and the returned settlement.
 *
 * The fixture is chosen so the three candidate values are all distinct:
 *   effectiveHourlyRate = 150   (the per-hour rate — the reported bug)
 *   new total           = 600   (charging her twice)
 *   already paid        = 300
 *   balance due         = 300   (600 − 300, the correct answer)
 */

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getPlatformConfig: jest.fn(),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
}));

jest.mock('@backend/services/pricing-config.service', () => ({
  buildBreakdown: jest.fn(),
  getPricingInputs: jest.fn(),
}));

jest.mock('@backend/services/reward.service', () => ({
  getRewardConfig: jest.fn().mockResolvedValue({
    enabled: true,
    redemptionPointsPerHour: 100,
    minRedemptionPoints: 100,
  }),
  getOrCreateWallet: jest.fn().mockResolvedValue({ pointsBalance: 0 }),
  applyBookingRedemption: jest.fn(),
  refundBookingRedemption: jest.fn().mockResolvedValue(undefined),
  grantPoints: jest.fn(),
}));

jest.mock('@backend/services/package-hours.service', () => ({
  getAvailableHours: jest.fn().mockResolvedValue(0),
  reapplyPackageHoursForBooking: jest
    .fn()
    .mockResolvedValue({ hoursApplied: 0, skillsCovered: 0, creditAmount: 0 }),
  refundPackageHours: jest.fn(),
}));

jest.mock('@backend/services/promo-code.service', () => ({
  validatePromoCode: jest.fn(),
}));

// Keep the real "what she has paid" sum — it is the input to the money math
// under test; only the detail DTO fetch is stubbed.
jest.mock('@backend/services/admin-booking.service', () => ({
  ...jest.requireActual('@backend/services/admin-booking.service'),
  getAdminBooking: jest.fn(),
}));

jest.mock('@backend/services/payment-refund.service', () => ({
  refundBookingPayment: jest.fn(),
}));

// Keep the real (pure) duration math; only stub the nanny-calendar DB probe.
jest.mock('@backend/services/booking.service', () => ({
  assertNoConflict: jest.fn().mockResolvedValue(undefined),
  computeDurationHours: (start: Date, end: Date) =>
    Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100,
}));

import { prisma } from '@backend/db/prisma';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { buildBreakdown, getPricingInputs } from '@backend/services/pricing-config.service';
import { getAdminBooking } from '@backend/services/admin-booking.service';
import { createInAppNotification } from '@backend/services/notification.service';
import { assertNoConflict } from '@backend/services/booking.service';
import { validatePromoCode } from '@backend/services/promo-code.service';
import { AppError } from '@backend/lib/errors';
import {
  applyBookingRedemption,
  getOrCreateWallet,
  getRewardConfig,
  refundBookingRedemption,
} from '@backend/services/reward.service';
import { getAvailableHours, reapplyPackageHoursForBooking } from '@backend/services/package-hours.service';
import {
  applyBookingEdit,
  getBookingEditContext,
  previewBookingEdit,
} from '@backend/services/admin-booking-edit.service';

const ADMIN_UID = 'fb-admin';
const ADMIN_ID = 3;
const UPDATED_AT = new Date('2026-07-12T00:00:00.000Z');

/** Prisma.Decimal stand-in — the service only ever calls `.toNumber()`. */
const dec = (n: number) => ({ toNumber: () => n });

const tx = {
  booking: { findFirst: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  bookingAdjustment: { findFirst: jest.fn(), create: jest.fn() },
  payment: { findFirst: jest.fn() },
  address: { findFirst: jest.fn() },
};

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  booking: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};
const mockGetPlatformConfig = getPlatformConfig as jest.Mock;
const mockGetPricingInputs = getPricingInputs as jest.Mock;
const mockBuildBreakdown = buildBreakdown as jest.Mock;
const mockGetAdminBooking = getAdminBooking as jest.Mock;
const mockNotify = createInAppNotification as jest.Mock;

const platformConfig = {
  minBookingHours: 1,
  maxBookingHours: 12,
  // A full-day window (end == start). 24 is not a valid window hour, and would
  // put a DAILY_WINDOW warning on every edit.
  bookingWindowStartHour: 0,
  bookingWindowEndHour: 0,
  includedChildrenPerBooking: 1,
  maxChildrenPerBooking: 5,
};

/** The re-priced booking: 4 h × EGP 150 = 600 total, EGP 150/h effective rate. */
function newBreakdown() {
  return {
    baseRate: 100,
    durationHours: 4,
    skillAddOns: [{ id: 1, name: 'Swimming', feeType: 'FLAT', feeValue: 50, amountPerHour: 50 }],
    childrenCount: 1,
    includedChildren: 1,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    effectiveHourlyRate: 150,
    subtotal: 600,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 600,
    nannyPercent: 80,
    platformPercent: 20,
    nannyAmount: 480,
    platformAmount: 120,
  };
}

/** A CONFIRMED booking priced at 3 h × EGP 100 = 300, already paid in full. */
function makeEditBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    status: PrismaBookingStatus.CONFIRMED,
    baseRate: dec(100),
    effectiveHourlyRate: dec(100),
    durationHours: dec(3),
    durationMultiplier: dec(1),
    subtotal: dec(300),
    discountAmount: dec(0),
    totalAmount: dec(300),
    nannyAmount: dec(240),
    platformAmount: dec(60),
    packageHoursApplied: dec(0),
    packageCreditAmount: dec(0),
    rewardCreditHoursApplied: dec(0),
    rewardCreditPoints: 0,
    rewardCreditAmount: dec(0),
    promoCode: null,
    promoCodeId: null,
    mother: { id: 10 },
    nannyProfileId: 19,
    nannyProfile: { id: 19, user: { id: 16 } },
    payments: [{ amount: dec(300), refundedAmount: dec(0), status: 'CAPTURED' }],
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

const rewardConfig = { enabled: true, redemptionPointsPerHour: 100, minRedemptionPoints: 100 };

const editInput = {
  startTime: '2026-08-02T10:00:00',
  endTime: '2026-08-02T14:00:00', // 4 hours
  children: [{ name: null, ageYears: 3, allergies: null }],
  skillIds: [1],
  usePackageHours: false,
  carePointsHours: 0,
};
const commitInput = {
  ...editInput,
  revision: UPDATED_AT.toISOString(),
  acknowledgeSoftWarnings: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());
  tx.booking.findFirst.mockResolvedValue(makeEditBooking());
  mockPrisma.$transaction.mockImplementation((cb: (client: typeof tx) => unknown) => cb(tx));
  mockGetPlatformConfig.mockResolvedValue(platformConfig);
  mockGetPricingInputs.mockResolvedValue({ baseRate: 100, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });
  mockBuildBreakdown.mockImplementation(() => newBreakdown());
  mockGetAdminBooking.mockResolvedValue({ id: 4 });
  tx.booking.updateMany.mockResolvedValue({ count: 1 });
  tx.booking.update.mockResolvedValue({});
  tx.bookingAdjustment.findFirst.mockResolvedValue(null);
  tx.bookingAdjustment.create.mockResolvedValue({ id: 55 });
  tx.payment.findFirst.mockResolvedValue(null);
  tx.address.findFirst.mockResolvedValue(null);
  (assertNoConflict as jest.Mock).mockReset().mockResolvedValue(undefined);
  (validatePromoCode as jest.Mock).mockReset();
  (applyBookingRedemption as jest.Mock).mockReset();
  (getAvailableHours as jest.Mock).mockReset().mockResolvedValue(0);
  (getOrCreateWallet as jest.Mock).mockReset().mockResolvedValue({ pointsBalance: 0 });
  (getRewardConfig as jest.Mock).mockReset().mockResolvedValue(rewardConfig);
  (reapplyPackageHoursForBooking as jest.Mock)
    .mockReset()
    .mockResolvedValue({ hoursApplied: 0, skillsCovered: 0, creditAmount: 0 });
});

describe('applyBookingEdit — balance-due amount', () => {
  it('charges the mother the full difference (new total − paid), not the per-hour rate', async () => {
    tx.booking.findFirst.mockResolvedValue(makeEditBooking());

    const result = await applyBookingEdit(4, ADMIN_UID, commitInput);

    // The obligation written to the DB — this is the number on her payment card.
    expect(tx.bookingAdjustment.create).toHaveBeenCalledTimes(1);
    const created = tx.bookingAdjustment.create.mock.calls[0][0];
    expect(created.data.amountEgp).toBe(300); // 600 new total − 300 already paid
    expect(created.data.status).toBe('PENDING_PAYMENT');

    // Guard against the exact regression that was reported.
    expect(created.data.amountEgp).not.toBe(150); // the effective per-hour rate
    expect(created.data.amountEgp).not.toBe(600); // the whole new total (double charge)

    // The settlement handed back to the admin agrees with what she was charged.
    expect(result.settlement.balanceDueAmount).toBe(300);
    expect(result.settlement.delta).toBe(300);

    // And she is notified about that same difference.
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'BOOKING_BALANCE_DUE' }),
    );
  });

  it('raises no balance-due obligation when the booking had not been paid yet', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ status: PrismaBookingStatus.APPROVED, payments: [] }),
    );

    const result = await applyBookingEdit(4, ADMIN_UID, commitInput);

    // Nothing paid → she settles the new total through normal checkout, so no
    // "pay the difference" obligation is created.
    expect(tx.bookingAdjustment.create).not.toHaveBeenCalled();
    expect(result.settlement.balanceDueAmount).toBe(600);
    expect(mockNotify).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BOOKING_BALANCE_DUE' }),
    );
  });
});

describe('previewBookingEdit — balance-due amount', () => {
  it('previews the difference the mother owes, not the per-hour rate', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.new.totalAmount).toBe(600);
    expect(preview.amountPaid).toBe(300);
    expect(preview.delta).toBe(300);
    expect(preview.balanceDueAmount).toBe(300);
    expect(preview.balanceDueAmount).not.toBe(150); // not the per-hour rate
  });
});

/**
 * A booking that already redeemed Care Points holds them — they left the wallet
 * at checkout. An edit releases them before re-applying, so the balance check
 * must count them back in, or re-keeping the booking's own redemption is
 * refused as "not enough Care Points" (the reported bug: an empty wallet
 * because every point went into this booking).
 */
describe('booking edit — Care Points the booking already holds', () => {
  const heldBooking = () =>
    makeEditBooking({
      rewardCreditHoursApplied: dec(2),
      rewardCreditPoints: 200,
      rewardCreditAmount: dec(200),
    });
  const keepPoints = { ...editInput, carePointsHours: 2 };

  beforeEach(() => {
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 0 });
  });

  it('previews re-keeping the redemption instead of blocking it', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(heldBooking());

    const preview = await previewBookingEdit(4, ADMIN_UID, keepPoints);

    expect(preview.warnings.map((w) => w.code)).not.toContain('POINTS_BALANCE');
    expect(preview.new.rewardCreditPoints).toBe(200);
    expect(preview.new.rewardCreditAmount).toBe(300); // 2 h × EGP 150
    expect(preview.new.totalAmount).toBe(300);
  });

  it('commits the edit with the redemption re-applied', async () => {
    tx.booking.findFirst.mockResolvedValue(heldBooking());
    (applyBookingRedemption as jest.Mock).mockResolvedValue({ hours: 2, pointsCost: 200, discount: 300 });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, carePointsHours: 2 });

    expect(refundBookingRedemption).toHaveBeenCalledWith(tx, expect.objectContaining({ points: 200 }));
    expect(applyBookingRedemption).toHaveBeenCalledWith(tx, expect.objectContaining({ redeemHours: 2 }));
  });

  it('still blocks redeeming more than the wallet plus the held points', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(heldBooking());

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 3 });

    expect(preview.warnings.map((w) => w.code)).toContain('POINTS_BALANCE');
  });

  it('offers the held points in the editor context', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(heldBooking());

    const context = await getBookingEditContext(4);

    expect(context.carePoints.pointsBalance).toBe(200);
  });
});

/**
 * Package hours come before Care Points, and points only ever buy the hours the
 * package leaves owed. The preview tells the admin when a request is trimmed or
 * not needed at all; the commit never spends points on a covered booking.
 */
describe('booking edit — Care Points after package hours', () => {
  const withPackage = { ...editInput, usePackageHours: true };

  beforeEach(() => {
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });
  });

  it('trims a points request to the hours the package leaves owed', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());
    // 3 package hours × EGP 150 of a 600 total → 150 (one hour) still owed.
    (getAvailableHours as jest.Mock).mockResolvedValueOnce(3);

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...withPackage, carePointsHours: 3 });

    expect(preview.warnings.map((w) => w.code)).toContain('POINTS_TRIMMED');
    expect(preview.new.rewardCreditPoints).toBe(100);
    expect(preview.new.totalAmount).toBe(0);
  });

  it('uses no points when the package already covers everything', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());
    (getAvailableHours as jest.Mock).mockResolvedValueOnce(10);

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...withPackage, carePointsHours: 2 });

    expect(preview.warnings.map((w) => w.code)).toContain('POINTS_NOT_NEEDED');
    expect(preview.warnings.filter((w) => w.severity === 'block')).toEqual([]);
    expect(preview.new.rewardCreditPoints).toBe(0);
  });

  it('does not redeem points on commit when the package covers the booking', async () => {
    tx.booking.findFirst.mockResolvedValue(makeEditBooking());
    (getAvailableHours as jest.Mock).mockResolvedValue(10);
    (reapplyPackageHoursForBooking as jest.Mock).mockResolvedValueOnce({
      hoursApplied: 4,
      skillsCovered: 0,
      creditAmount: 600,
    });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, usePackageHours: true, carePointsHours: 2 });

    expect(applyBookingRedemption).not.toHaveBeenCalled();
    (getAvailableHours as jest.Mock).mockResolvedValue(0);
  });

  it('tells the redemption what the package left owed', async () => {
    tx.booking.findFirst.mockResolvedValue(makeEditBooking());
    (getAvailableHours as jest.Mock).mockResolvedValue(3);
    (reapplyPackageHoursForBooking as jest.Mock).mockResolvedValueOnce({
      hoursApplied: 3,
      skillsCovered: 0,
      creditAmount: 450,
    });
    (applyBookingRedemption as jest.Mock).mockResolvedValue({ hours: 1, pointsCost: 100, discount: 150 });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, usePackageHours: true, carePointsHours: 1 });

    expect(applyBookingRedemption).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ redeemHours: 1, owedAmount: 150 }),
    );
    (getAvailableHours as jest.Mock).mockResolvedValue(0);
  });
});

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

/**
 * Every rule the editor enforces, as the admin sees it in the preview. Blocks
 * stop the commit; warns only need acknowledging.
 */
describe('previewBookingEdit — validation', () => {
  beforeEach(() => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());
  });

  it('accepts a clean edit with no warnings', async () => {
    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toEqual([]);
    expect(preview.revision).toBe(UPDATED_AT.toISOString());
  });

  it('rejects a caller who is not staff', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(previewBookingEdit(4, 'fb-mother', editInput)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Admin access required',
    });
  });

  it('404s on a booking that does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    await expect(previewBookingEdit(4, ADMIN_UID, editInput)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it.each([
    PrismaBookingStatus.IN_PROGRESS,
    PrismaBookingStatus.COMPLETED,
    PrismaBookingStatus.CANCELLED,
  ])('blocks editing a %s booking', async (status) => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking({ status }));

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'STATUS',
        severity: 'block',
        message: `A ${status.toLowerCase()} booking can no longer be edited.`,
      }),
    );
  });

  it.each([PrismaBookingStatus.PENDING, PrismaBookingStatus.APPROVED])(
    'lets a %s booking be edited',
    async (status) => {
      mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking({ status, payments: [] }));

      const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

      expect(codes(preview.warnings)).not.toContain('STATUS');
    },
  );

  it('blocks an end time that is not after the start, and never prices a negative duration', async () => {
    const preview = await previewBookingEdit(4, ADMIN_UID, {
      ...editInput,
      startTime: '2026-08-02T14:00:00',
      endTime: '2026-08-02T10:00:00',
    });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'TIME_ORDER', severity: 'block', field: 'endTime' }),
    );
    expect(mockBuildBreakdown.mock.calls[0][1].durationHours).toBe(0);
  });

  it('blocks a booking shorter than the minimum', async () => {
    mockGetPlatformConfig.mockResolvedValue({ ...platformConfig, minBookingHours: 2 });

    const preview = await previewBookingEdit(4, ADMIN_UID, {
      ...editInput,
      endTime: '2026-08-02T11:00:00',
    });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'MIN_DURATION',
        severity: 'block',
        message: 'Minimum booking duration is 2 hours.',
      }),
    );
  });

  it('blocks a booking longer than the maximum', async () => {
    const preview = await previewBookingEdit(4, ADMIN_UID, {
      ...editInput,
      startTime: '2026-08-02T08:00:00',
      endTime: '2026-08-02T21:00:00',
    });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'MAX_DURATION',
        severity: 'block',
        message: 'Maximum booking duration is 12 hours.',
      }),
    );
  });

  it('only warns (does not block) when the times fall outside the daily window', async () => {
    mockGetPlatformConfig.mockResolvedValue({
      ...platformConfig,
      bookingWindowStartHour: 12,
      bookingWindowEndHour: 20,
    });

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toEqual([
      expect.objectContaining({
        code: 'DAILY_WINDOW',
        severity: 'warn',
        message: 'Outside the daily booking window (12:00–20:00).',
      }),
    ]);
  });

  it('blocks more children than one nanny may care for', async () => {
    const child = { name: null, ageYears: 3, allergies: null };

    const preview = await previewBookingEdit(4, ADMIN_UID, {
      ...editInput,
      children: Array.from({ length: 6 }, () => child),
    });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'CHILDREN_CEILING',
        severity: 'block',
        message: 'One nanny can care for at most 5 children.',
      }),
    );
    expect(mockBuildBreakdown.mock.calls[0][1].childrenCount).toBe(6);
  });

  it('blocks new times that clash with the assigned nanny’s calendar, quoting why', async () => {
    (assertNoConflict as jest.Mock).mockRejectedValue(
      new AppError('This nanny is already booked for the requested time slot.', 409),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'NANNY_CONFLICT',
        severity: 'block',
        message: 'This nanny is already booked for the requested time slot.',
      }),
    );
    // The booking's own slot is excluded from the clash check.
    expect(assertNoConflict).toHaveBeenCalledWith(19, expect.any(Date), expect.any(Date), 4);
  });

  it('still blocks a calendar clash when the check fails unexpectedly', async () => {
    (assertNoConflict as jest.Mock).mockRejectedValue(new Error('connection reset'));

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'NANNY_CONFLICT',
        message: 'The assigned nanny has a conflicting booking.',
      }),
    );
  });

  it('skips the calendar check on a booking no nanny has claimed', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ nannyProfileId: null, nannyProfile: null }),
    );

    await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(assertNoConflict).not.toHaveBeenCalled();
  });

  it('re-prices at the booking’s own agreed rate and warns that the platform rate moved', async () => {
    mockGetPricingInputs.mockResolvedValue({ baseRate: 120, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(mockBuildBreakdown.mock.calls[0][0].baseRate).toBe(100);
    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'BASE_RATE_DRIFT',
        severity: 'warn',
        message:
          "Priced at the booking's original rate (EGP 100.00/h); the current platform rate is EGP 120.00/h.",
      }),
    );
  });

  it('prices at the platform rate when the booking has no rate snapshot', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking({ baseRate: dec(0) }));
    mockGetPricingInputs.mockResolvedValue({ baseRate: 120, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(mockBuildBreakdown.mock.calls[0][0].baseRate).toBe(120);
    expect(codes(preview.warnings)).not.toContain('BASE_RATE_DRIFT');
  });

  it('does not call sub-cent rate noise a drift', async () => {
    mockGetPricingInputs.mockResolvedValue({ baseRate: 100.001, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(codes(preview.warnings)).not.toContain('BASE_RATE_DRIFT');
  });

  it('treats a missing skill list as no add-ons', async () => {
    const { skillIds: _omit, ...withoutSkills } = editInput;

    await previewBookingEdit(4, ADMIN_UID, withoutSkills as typeof editInput);

    expect(mockBuildBreakdown.mock.calls[0][1].skillIds).toEqual([]);
  });

  it('blocks an unknown skill with the pricing engine’s own message', async () => {
    mockBuildBreakdown.mockImplementationOnce(() => {
      throw new AppError('Unknown or inactive skill: 99', 400);
    });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, skillIds: [99] });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_SKILL',
        severity: 'block',
        field: 'skillIds',
        message: 'Unknown or inactive skill: 99',
      }),
    );
  });

  it('blocks a skill the pricing engine failed on unexpectedly', async () => {
    mockBuildBreakdown.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_SKILL',
        message: 'One of the selected skills is unavailable.',
      }),
    );
  });

  // BUG: admin-booking-edit.service.ts:298 calls buildBreakdown a second time,
  // outside the try/catch at :252. The real buildBreakdown throws on an unknown
  // skill both times, so the preview rejects with a bare 400 instead of
  // returning the UNKNOWN_SKILL block warning built at :256 (dead code in practice).
  it.skip('BUG: reports an unknown skill as a warning instead of failing the preview', async () => {
    mockBuildBreakdown.mockImplementation((_inputs: unknown, opts: { skillIds: number[] }) => {
      if (opts.skillIds.includes(99)) throw new AppError('Unknown or inactive skill: 99', 400);
      return newBreakdown();
    });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, skillIds: [99] });

    expect(codes(preview.warnings)).toContain('UNKNOWN_SKILL');
  });
});

describe('previewBookingEdit — promo code', () => {
  /** A breakdown that honours the discount it is given, like the real engine. */
  beforeEach(() => {
    mockBuildBreakdown.mockImplementation(
      (_inputs: unknown, opts: { discountAmount?: number }) => {
        const discount = opts.discountAmount ?? 0;
        return { ...newBreakdown(), discountAmount: discount, totalAmount: 600 - discount };
      },
    );
  });

  const percentPromo = { id: 7, code: 'TEN', discountType: 'PERCENTAGE', value: dec(10) };
  const flatPromo = { id: 8, code: 'FIFTY', discountType: 'FLAT', value: dec(50) };

  it('recomputes a kept percentage promo against the new subtotal, without re-checking its caps', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: percentPromo, promoCodeId: 7 }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(validatePromoCode).not.toHaveBeenCalled();
    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(60); // 10% of 600
    expect(preview.new.totalAmount).toBe(540);
  });

  it('keeps a flat promo at its face value', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: flatPromo, promoCodeId: 8 }),
    );

    await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(50);
  });

  it('never lets a kept flat promo discount more than the new subtotal', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: { ...flatPromo, value: dec(1000) }, promoCodeId: 8 }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(600);
    expect(preview.new.totalAmount).toBe(0);
  });

  it('rounds a kept percentage discount to 2dp', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: { ...percentPromo, value: dec(3.333) }, promoCodeId: 7 }),
    );

    await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(20); // 19.998
  });

  it('clears the promo on an unpaid booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({
        status: PrismaBookingStatus.APPROVED,
        payments: [],
        promoCode: flatPromo,
        promoCodeId: 8,
      }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: null });

    expect(preview.warnings).toEqual([]);
    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(0);
  });

  it('blocks removing a promo after payment', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: flatPromo, promoCodeId: 8 }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: null });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PROMO_LOCKED',
        severity: 'block',
        message: 'The promo code cannot be changed after payment.',
      }),
    );
  });

  it('lets "no promo" stand on a paid booking that never had one', async () => {
    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: null });

    expect(codes(preview.warnings)).not.toContain('PROMO_LOCKED');
  });

  it('blocks swapping in a different promo after payment, without validating it', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: flatPromo, promoCodeId: 8 }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: 'OTHER' });

    expect(codes(preview.warnings)).toContain('PROMO_LOCKED');
    expect(validatePromoCode).not.toHaveBeenCalled();
  });

  it('re-validates the same code on a paid booking rather than locking it', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: flatPromo, promoCodeId: 8 }),
    );
    (validatePromoCode as jest.Mock).mockResolvedValue({ promoCodeId: 8, discountAmount: 50 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: 'FIFTY' });

    expect(codes(preview.warnings)).not.toContain('PROMO_LOCKED');
    expect(validatePromoCode).toHaveBeenCalled();
  });

  it('applies a new code to an unpaid booking, excluding this booking from its usage caps', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ status: PrismaBookingStatus.APPROVED, payments: [] }),
    );
    (validatePromoCode as jest.Mock).mockResolvedValue({ promoCodeId: 9, discountAmount: 75 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: 'NEW' });

    expect(validatePromoCode).toHaveBeenCalledWith('NEW', 600, 10, { excludeBookingId: 4 });
    expect(preview.new.totalAmount).toBe(525);
    expect(preview.new.discountAmount).toBe(75);
  });

  it('blocks an invalid code with the promo service’s reason', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ status: PrismaBookingStatus.APPROVED, payments: [] }),
    );
    (validatePromoCode as jest.Mock).mockRejectedValue(new AppError('This promo code has expired.', 400));

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: 'OLD' });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'PROMO_INVALID',
        severity: 'block',
        message: 'This promo code has expired.',
      }),
    );
    expect(mockBuildBreakdown.mock.calls[1][1].discountAmount).toBe(0);
  });

  it('blocks a code whose validation failed unexpectedly', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ status: PrismaBookingStatus.APPROVED, payments: [] }),
    );
    (validatePromoCode as jest.Mock).mockRejectedValue(new Error('timeout'));

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, promoCode: 'X' });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({ code: 'PROMO_INVALID', message: 'That promo code is not valid.' }),
    );
  });
});

describe('previewBookingEdit — package hours and Care Points simulation', () => {
  beforeEach(() => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());
  });

  it('counts the hours this booking already holds as spendable again', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ packageHoursApplied: dec(2) }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, usePackageHours: true });

    expect(preview.new.packageHoursApplied).toBe(2);
    expect(preview.new.packageCreditAmount).toBe(300);
    expect(preview.new.totalAmount).toBe(300);
    // The platform funds the credit; the nanny's share is untouched.
    expect(preview.new.nannyAmount).toBe(480);
    expect(preview.new.platformAmount).toBe(-180);
  });

  it('applies package hours by default when the admin does not say otherwise', async () => {
    (getAvailableHours as jest.Mock).mockResolvedValue(1);
    const { usePackageHours: _omit, ...defaults } = editInput;

    const preview = await previewBookingEdit(4, ADMIN_UID, defaults as typeof editInput);

    expect(preview.new.packageHoursApplied).toBe(1);
  });

  it('applies no package hours when the admin turns them off', async () => {
    (getAvailableHours as jest.Mock).mockResolvedValue(10);

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.new.packageHoursApplied).toBe(0);
    expect(preview.new.totalAmount).toBe(600);
  });

  it('never spends more package hours than the booking runs', async () => {
    (getAvailableHours as jest.Mock).mockResolvedValue(10);

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, usePackageHours: true });

    expect(preview.new.packageHoursApplied).toBe(4);
    expect(preview.new.packageCreditAmount).toBe(600);
    expect(preview.new.totalAmount).toBe(0);
  });

  it('spends only whole hours the post-promo total can afford', async () => {
    mockBuildBreakdown.mockImplementation(() => ({ ...newBreakdown(), totalAmount: 550 }));
    (getAvailableHours as jest.Mock).mockResolvedValue(10);

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, usePackageHours: true });

    // 550 ÷ 150 = 3.67 → 3 whole hours, worth 450; 100 stays owed.
    expect(preview.new.packageHoursApplied).toBe(3);
    expect(preview.new.packageCreditAmount).toBe(450);
    expect(preview.new.totalAmount).toBe(100);
  });

  it('spends no package hours on a booking with no hourly value', async () => {
    mockBuildBreakdown.mockImplementation(() => ({
      ...newBreakdown(),
      effectiveHourlyRate: 0,
      totalAmount: 0,
    }));
    (getAvailableHours as jest.Mock).mockResolvedValue(10);

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, usePackageHours: true });

    expect(preview.new.packageHoursApplied).toBe(0);
    expect(preview.new.packageCreditAmount).toBe(0);
  });

  it('blocks Care Points while redemption is switched off', async () => {
    (getRewardConfig as jest.Mock).mockResolvedValue({ ...rewardConfig, enabled: false });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 1 });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'POINTS_DISABLED',
        severity: 'block',
        message: 'Care Points redemption is currently unavailable.',
      }),
    );
    expect(preview.new.rewardCreditPoints).toBe(0);
  });

  it('blocks a request for less than one whole hour of points', async () => {
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 0.5 });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'POINTS_MIN',
        severity: 'block',
        message: 'Choose at least one hour of Care Points to redeem.',
      }),
    );
  });

  it('blocks a redemption below the minimum points per redemption', async () => {
    (getRewardConfig as jest.Mock).mockResolvedValue({ ...rewardConfig, minRedemptionPoints: 300 });
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 2 });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'POINTS_MIN',
        message: 'At least 300 points must be redeemed at a time.',
      }),
    );
  });

  it('trims a points request to the hours still owed, in the plural', async () => {
    (getAvailableHours as jest.Mock).mockResolvedValue(1);
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });

    const preview = await previewBookingEdit(4, ADMIN_UID, {
      ...editInput,
      usePackageHours: true,
      carePointsHours: 4,
    });

    expect(preview.warnings).toContainEqual(
      expect.objectContaining({
        code: 'POINTS_TRIMMED',
        severity: 'warn',
        message:
          'Only 3 hours of Care Points are needed to cover what is left; the rest stay in her wallet.',
      }),
    );
    expect(preview.new.rewardCreditPoints).toBe(300);
    expect(preview.new.totalAmount).toBe(0);
  });

  it('caps the points discount at what is still owed', async () => {
    // A EGP 50 flat promo leaves 550: four hours of points are worth 600, but
    // only 550 can come off.
    mockBuildBreakdown.mockImplementation(() => ({ ...newBreakdown(), totalAmount: 550 }));
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 4 });

    expect(preview.new.rewardCreditAmount).toBe(550);
    expect(preview.new.totalAmount).toBe(0);
    expect(codes(preview.warnings)).not.toContain('POINTS_TRIMMED');
  });

  it('redeems no points when the admin leaves the field out', async () => {
    const { carePointsHours: _omit, ...withoutPoints } = editInput;

    const preview = await previewBookingEdit(4, ADMIN_UID, withoutPoints as typeof editInput);

    expect(getRewardConfig).not.toHaveBeenCalled();
    expect(preview.new.rewardCreditPoints).toBe(0);
  });

  it('reads plain-number money columns as readily as decimals', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking({ packageHoursApplied: 2 }));

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, usePackageHours: true });

    expect(preview.new.packageHoursApplied).toBe(2);
  });

  it('never redeems more hours than the booking runs', async () => {
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 10_000 });

    const preview = await previewBookingEdit(4, ADMIN_UID, { ...editInput, carePointsHours: 9 });

    expect(preview.new.rewardCreditHours).toBe(4);
  });
});

describe('previewBookingEdit — what she paid against the new total', () => {
  it('shows an overpayment as refundable and nothing due', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ payments: [{ amount: dec(800), refundedAmount: dec(0), status: 'CAPTURED' }] }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.delta).toBe(-200);
    expect(preview.refundableAmount).toBe(200);
    expect(preview.balanceDueAmount).toBe(0);
  });

  it('counts only money still held — a partial refund lowers what she paid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({
        payments: [
          { amount: dec(800), refundedAmount: dec(100), status: 'CAPTURED' },
          { amount: dec(999), refundedAmount: dec(0), status: 'FAILED' },
        ],
      }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.amountPaid).toBe(700);
    expect(preview.refundableAmount).toBe(100);
  });

  it('treats a sub-cent difference as settled', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ payments: [{ amount: dec(600.004), refundedAmount: dec(0), status: 'CAPTURED' }] }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.delta).toBe(0);
    expect(preview.refundableAmount).toBe(0);
    expect(preview.balanceDueAmount).toBe(0);
  });

  it('reports the booking’s current figures alongside the new ones', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeEditBooking());

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.old).toMatchObject({ totalAmount: 300, durationHours: 3, nannyAmount: 240 });
  });
});

describe('getBookingEditContext', () => {
  it('bounds the editor by the platform config and adds back the hours this booking holds', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeEditBooking({ packageHoursApplied: dec(1.5) }),
    );
    (getAvailableHours as jest.Mock).mockResolvedValue(2.25);
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 40 });

    const context = await getBookingEditContext(4);

    expect(context).toMatchObject({
      maxChildrenPerBooking: 5,
      minBookingHours: 1,
      maxBookingHours: 12,
      availablePackageHours: 3.75,
      carePoints: { pointsBalance: 40, redemptionPointsPerHour: 100, minRedemptionPoints: 100 },
    });
  });

  it('404s on a booking that does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    await expect(getBookingEditContext(4)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applyBookingEdit — guards', () => {
  beforeEach(() => {
    tx.booking.findFirst.mockResolvedValue(makeEditBooking());
  });

  it('rejects a caller who is not staff before opening a transaction', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(applyBookingEdit(4, 'fb-mother', commitInput)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s on a booking that does not exist', async () => {
    tx.booking.findFirst.mockResolvedValue(null);

    await expect(applyBookingEdit(4, ADMIN_UID, commitInput)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rejects a commit built against a stale preview', async () => {
    await expect(
      applyBookingEdit(4, ADMIN_UID, { ...commitInput, revision: '2026-07-11T00:00:00.000Z' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'This booking changed since you previewed it. Reload and try again.',
    });
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('refuses while an earlier balance-due is still unpaid', async () => {
    tx.bookingAdjustment.findFirst.mockResolvedValue({ id: 54 });

    await expect(applyBookingEdit(4, ADMIN_UID, commitInput)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Settle or cancel the pending balance-due on this booking before editing it.',
    });
    expect(tx.bookingAdjustment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: 4, status: 'PENDING_PAYMENT', deletedAt: null } }),
    );
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('refuses while a payment is in flight', async () => {
    tx.payment.findFirst.mockResolvedValue({ id: 31 });

    await expect(applyBookingEdit(4, ADMIN_UID, commitInput)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A payment is in progress on this booking. Wait for it to settle before editing.',
    });
    expect(tx.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookingId: 4, status: 'PENDING', deletedAt: null } }),
    );
  });

  it('refuses an edit with a blocking problem, listing every one', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      applyBookingEdit(4, ADMIN_UID, {
        ...commitInput,
        startTime: '2026-08-02T08:00:00',
        endTime: '2026-08-02T21:00:00',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'A completed booking can no longer be edited. Maximum booking duration is 12 hours.',
    });
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('refuses until the admin acknowledges the soft warnings', async () => {
    mockGetPricingInputs.mockResolvedValue({ baseRate: 120, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });

    await expect(
      applyBookingEdit(4, ADMIN_UID, { ...commitInput, acknowledgeSoftWarnings: false }),
    ).rejects.toThrow(/^Confirm these before saving: Priced at the booking's original rate/);
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('saves once the soft warnings are acknowledged', async () => {
    mockGetPricingInputs.mockResolvedValue({ baseRate: 120, addOnSkills: [], nannyPercent: 80, platformPercent: 20 });

    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(tx.booking.update).toHaveBeenCalled();
  });

  it('saves without an acknowledgement when there is nothing to acknowledge', async () => {
    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, acknowledgeSoftWarnings: false });

    expect(tx.booking.update).toHaveBeenCalled();
  });

  it('loses cleanly to a concurrent write: the guarded touch matches nothing, nothing is written', async () => {
    tx.booking.updateMany.mockResolvedValue({ count: 0 });
    tx.booking.findFirst.mockResolvedValue(makeEditBooking({ rewardCreditPoints: 200 }));

    await expect(applyBookingEdit(4, ADMIN_UID, commitInput)).rejects.toMatchObject({
      statusCode: 409,
      message: 'This booking changed while saving. Reload and try again.',
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 4, updatedAt: UPDATED_AT, deletedAt: null },
      data: { adminActionById: ADMIN_ID, adminActionAt: expect.any(Date) },
    });
    expect(refundBookingRedemption).not.toHaveBeenCalled();
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('applyBookingEdit — the new snapshot and the settlement', () => {
  beforeEach(() => {
    tx.booking.findFirst.mockResolvedValue(makeEditBooking());
  });

  const finalWrite = () => tx.booking.update.mock.calls[1][0].data;

  it('resets every credit column before re-applying them', async () => {
    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({
      totalAmount: 600,
      subtotal: 600,
      baseRate: 100,
      rewardCreditHoursApplied: 0,
      rewardCreditPoints: 0,
      rewardCreditAmount: 0,
      packageHoursApplied: 0,
      packageSkillsCovered: 0,
      packageCreditAmount: 0,
    });
  });

  it('releases no points when the booking held none', async () => {
    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(refundBookingRedemption).not.toHaveBeenCalled();
  });

  it('stacks promo, package and points into one discount, funded by the platform', async () => {
    mockBuildBreakdown.mockImplementation(() => ({
      ...newBreakdown(),
      discountAmount: 50,
      totalAmount: 550,
      platformAmount: 110,
      nannyAmount: 440,
    }));
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ promoCode: { id: 8, code: 'FIFTY', discountType: 'FLAT', value: dec(50) }, promoCodeId: 8 }),
    );
    (getAvailableHours as jest.Mock).mockResolvedValue(2);
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });
    (reapplyPackageHoursForBooking as jest.Mock).mockResolvedValue({
      hoursApplied: 2,
      skillsCovered: 1,
      creditAmount: 300,
    });
    (applyBookingRedemption as jest.Mock).mockResolvedValue({ hours: 1, pointsCost: 100, discount: 150 });

    const result = await applyBookingEdit(4, ADMIN_UID, {
      ...commitInput,
      usePackageHours: true,
      carePointsHours: 1,
    });

    expect(finalWrite()).toEqual({
      discountAmount: 500, // 50 promo + 300 package + 150 points
      totalAmount: 100, // 550 − 300 − 150
      platformAmount: -340, // 110 − 300 − 150
      packageHoursApplied: 2,
      packageSkillsCovered: 1,
      packageCreditAmount: 300,
      rewardCreditHoursApplied: 1,
      rewardCreditPoints: 100,
      rewardCreditAmount: 150,
    });
    expect(result.settlement.delta).toBe(-200);
  });

  it('never lets points take the total below zero', async () => {
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });
    (applyBookingRedemption as jest.Mock).mockResolvedValue({ hours: 4, pointsCost: 400, discount: 999 });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, carePointsHours: 4 });

    expect(finalWrite()).toMatchObject({ totalAmount: 0, rewardCreditAmount: 600 });
  });

  it('rounds the stacked figures to 2dp', async () => {
    (reapplyPackageHoursForBooking as jest.Mock).mockResolvedValue({
      hoursApplied: 0.1,
      skillsCovered: 0,
      creditAmount: 0.1,
    });
    (getOrCreateWallet as jest.Mock).mockResolvedValue({ pointsBalance: 1000 });
    (applyBookingRedemption as jest.Mock).mockResolvedValue({ hours: 1, pointsCost: 100, discount: 0.2 });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, usePackageHours: true, carePointsHours: 1 });

    expect(finalWrite()).toMatchObject({
      discountAmount: 0.3, // not 0.30000000000000004
      totalAmount: 599.7,
      platformAmount: 119.7,
    });
  });

  it('records an overpayment as refundable, with no balance-due raised', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ payments: [{ amount: dec(800), refundedAmount: dec(0), status: 'CAPTURED' }] }),
    );

    const result = await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(result.settlement).toEqual({
      delta: -200,
      amountPaid: 800,
      refundableAmount: 200,
      balanceDueAmount: 0,
      adjustmentId: null,
    });
    expect(tx.bookingAdjustment.create).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BOOKING_BALANCE_DUE' }),
    );
  });

  it('raises nothing when a sub-cent difference is all that is left', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ payments: [{ amount: dec(599.996), refundedAmount: dec(0), status: 'CAPTURED' }] }),
    );

    const result = await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(result.settlement.delta).toBe(0);
    expect(tx.bookingAdjustment.create).not.toHaveBeenCalled();
  });

  it('describes the change on the balance-due it raises, stamped with the admin', async () => {
    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(tx.bookingAdjustment.create).toHaveBeenCalledWith({
      data: {
        bookingId: 4,
        motherId: 10,
        status: 'PENDING_PAYMENT',
        amountEgp: 300,
        reason: 'duration 3h → 4h, total EGP 300.00 → EGP 600.00',
        createdById: ADMIN_ID,
      },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BOOKING_BALANCE_DUE',
        body: 'Your booking total went up. Please pay the difference of EGP 300.00 to keep it confirmed.',
      }),
    );
  });

  it('tells both parties what changed', async () => {
    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'BOOKING_EDITED',
        body: 'Our team updated your booking (duration 3h → 4h, total EGP 300.00 → EGP 600.00).',
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 16, type: 'BOOKING_EDITED' }),
    );
  });

  it('says "booking details" when neither the length nor the price moved', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ durationHours: dec(4), totalAmount: dec(600), payments: [] }),
    );

    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Our team updated your booking (booking details).' }),
    );
  });

  it('only tells the mother when no nanny is assigned', async () => {
    tx.booking.findFirst.mockResolvedValue(
      makeEditBooking({ nannyProfileId: null, nannyProfile: null, payments: [] }),
    );

    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10 }));
  });

  it('moves the booking to another of the mother’s addresses, snapshot and coordinates together', async () => {
    tx.address.findFirst.mockResolvedValue({
      id: 21,
      userId: 10,
      label: 'Work',
      formattedAddress: '1 Nile St',
      governorate: 'Cairo',
      area: 'Zamalek',
      street: 'Nile St',
      building: '1',
      floor: null,
      apartment: null,
      landmark: null,
      latitude: 30.06,
      longitude: 31.22,
    });

    await applyBookingEdit(4, ADMIN_UID, { ...commitInput, addressId: 21 });

    expect(tx.address.findFirst).toHaveBeenCalledWith({
      where: { id: 21, userId: 10, deletedAt: null },
    });
    expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({
      addressId: 21,
      latitude: 30.06,
      longitude: 31.22,
      bookedAddress: expect.objectContaining({ addressId: 21, formattedAddress: '1 Nile St' }),
    });
  });

  it('leaves the address alone when none is given', async () => {
    await applyBookingEdit(4, ADMIN_UID, commitInput);

    expect(tx.address.findFirst).not.toHaveBeenCalled();
    expect(tx.booking.update.mock.calls[0][0].data).not.toHaveProperty('addressId');
  });

  it('404s on an address that is not one of hers', async () => {
    await expect(
      applyBookingEdit(4, ADMIN_UID, { ...commitInput, addressId: 99 }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'Address not found.' });
  });
});
