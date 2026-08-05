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

jest.mock('@backend/services/admin-booking.service', () => ({
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
import {
  applyBookingEdit,
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
  bookingWindowStartHour: 0,
  bookingWindowEndHour: 24,
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
