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
 *
 * The second half of the file covers the other way an overpayment leaves the
 * booking: settled as Care Points. That has to be recorded on the booking, or
 * the money is offered back a second time and a later upward edit thinks it is
 * still covering the price.
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
  grantPointsInTx: jest.fn().mockResolvedValue({ pointsBalance: 250 }),
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
import { refundBookingPayment } from '@backend/services/payment-refund.service';
import { grantPointsInTx } from '@backend/services/reward.service';
import {
  applyBookingEdit,
  previewBookingEdit,
  refundBooking,
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
const mockRefundPayment = refundBookingPayment as jest.Mock;
const mockGrantPointsInTx = grantPointsInTx as jest.Mock;

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
    refundedAsPointsAmount: dec(0),
    refundedAsPointsAt: null,
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

// ── Settling an overpayment as Care Points ────────────────────────────────────

/**
 * A booking shortened after payment: she paid 600, it now costs 400, so 200 is
 * hers to get back. The whole point of the fixture is that the 200 is visible
 * from two independent places — the payments and the booking — and the two must
 * not both offer it.
 */
function makeOverpaidBooking(overrides: Record<string, unknown> = {}) {
  return makeEditBooking({
    totalAmount: dec(400),
    payments: [{ amount: dec(600), refundedAmount: dec(0), status: 'CAPTURED' }],
    ...overrides,
  });
}

const REFUND_REASON = 'We shortened the booking.';

describe('refundBooking — settling as Care Points', () => {
  it('records the whole overpayment against the booking and grants the points together', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeOverpaidBooking());

    const result = await refundBooking(4, ADMIN_UID, {
      method: 'CARE_POINTS',
      points: 250,
      reason: REFUND_REASON,
    });

    // How many points is the admin's call; what is SETTLED is the EGP.
    expect(result).toMatchObject({ method: 'CARE_POINTS', grantedPoints: 250, settledAmount: 200 });
    expect(result.refundedAmount).toBeNull();

    const written = tx.booking.updateMany.mock.calls[0][0];
    expect(written.data.refundedAsPointsAmount).toBe(200);
    expect(written.data.refundedAsPointsAt).toBeInstanceOf(Date);
    // Guarded on the figure the refund was priced against, so a concurrent
    // settlement can't stack a second one on top.
    expect(written.where).toMatchObject({ id: 4, refundedAsPointsAmount: expect.anything() });

    // The points carry the booking, so the ledger says which overpayment they settled.
    expect(mockGrantPointsInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 10, points: 250, bookingId: 4, adminId: ADMIN_ID }),
    );
    // No money moved.
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'BOOKING_REFUNDED' }),
    );
  });

  it('settles only the amount asked for, leaving the rest refundable', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeOverpaidBooking());

    const result = await refundBooking(4, ADMIN_UID, {
      method: 'CARE_POINTS',
      points: 100,
      amount: 50,
      reason: REFUND_REASON,
    });

    expect(result.settledAmount).toBe(50);
    expect(tx.booking.updateMany.mock.calls[0][0].data.refundedAsPointsAmount).toBe(50);
  });

  it('accumulates onto an earlier points settlement rather than replacing it', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeOverpaidBooking({ refundedAsPointsAmount: dec(50) }),
    );

    await refundBooking(4, ADMIN_UID, {
      method: 'CARE_POINTS',
      points: 100,
      amount: 50,
      reason: REFUND_REASON,
    });

    expect(tx.booking.updateMany.mock.calls[0][0].data.refundedAsPointsAmount).toBe(100);
  });

  it('refuses to settle more than is overpaid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeOverpaidBooking());

    await expect(
      refundBooking(4, ADMIN_UID, {
        method: 'CARE_POINTS',
        points: 500,
        amount: 300,
        reason: REFUND_REASON,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGrantPointsInTx).not.toHaveBeenCalled();
  });

  it('turns away a settlement that raced another one', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeOverpaidBooking());
    tx.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 250, reason: REFUND_REASON }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('refundBooking — after the overpayment was settled as points', () => {
  /** The same booking once the full 200 has gone back as Care Points. */
  function settled(overrides: Record<string, unknown> = {}) {
    return makeOverpaidBooking({
      refundedAsPointsAmount: dec(200),
      refundedAsPointsAt: new Date('2026-08-01T00:00:00.000Z'),
      ...overrides,
    });
  }

  it('refuses a follow-up card refund — the money is already back with her', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(settled());

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'Again.' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('refuses a second points settlement too', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(settled());

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 50, reason: 'Again.' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGrantPointsInTx).not.toHaveBeenCalled();
  });

  it('still allows a card refund of what is left after a partial settlement', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(settled({ refundedAsPointsAmount: dec(150) }));

    const result = await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'The rest.' });

    // 600 paid − 150 settled as points − 400 owed = 50 left on the card.
    expect(result.refundedAmount).toBe(50);
    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 50 });
  });
});

describe('editing a booking whose overpayment was settled as points', () => {
  /** Paid 600, cut to 400, the 200 given back as points — then raised to 600 again. */
  function reRaised() {
    return makeOverpaidBooking({ refundedAsPointsAmount: dec(200) });
  }

  it('charges back what the points returned instead of treating it as covered', async () => {
    tx.booking.findFirst.mockResolvedValue(reRaised());

    const result = await applyBookingEdit(4, ADMIN_UID, commitInput);

    // Naively, 600 new total − 600 paid = 0 and the 200 in points was free.
    // Against the net paid figure (600 − 200) she owes the 200 back.
    expect(result.settlement.delta).toBe(200);
    expect(result.settlement.balanceDueAmount).toBe(200);
    expect(result.settlement.amountPaid).toBe(600);
    expect(result.settlement.refundedAsPointsAmount).toBe(200);
    expect(tx.bookingAdjustment.create.mock.calls[0][0].data.amountEgp).toBe(200);
  });

  it('previews that same charge before anything is saved', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(reRaised());

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.amountPaid).toBe(600);
    expect(preview.refundedAsPointsAmount).toBe(200);
    expect(preview.delta).toBe(200);
    expect(preview.balanceDueAmount).toBe(200);
  });

  it('offers back only what has not already gone back as points', async () => {
    // Re-priced to 600 but she had 500 of a 700 payment returned as points:
    // net paid 200, so the booking is now UNDER-paid, not over.
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeOverpaidBooking({
        payments: [{ amount: dec(700), refundedAmount: dec(0), status: 'CAPTURED' }],
        refundedAsPointsAmount: dec(500),
      }),
    );

    const preview = await previewBookingEdit(4, ADMIN_UID, editInput);

    expect(preview.refundableAmount).toBe(0);
    expect(preview.balanceDueAmount).toBe(400); // 600 − (700 − 500)
  });
});
