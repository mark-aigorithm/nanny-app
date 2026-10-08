import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

/**
 * Giving money back on a booking (admin "Refund"): to the card through Paymob,
 * or as Care Points. Two situations reach it — an edit that left the mother
 * overpaid, and a booking cancelled after she paid — and the rules differ:
 *
 * - The card refund is capped at what is refundable (the overpayment, or what
 *   she paid and still has), never more.
 * - A cancelled booking moves to REFUNDED once settled: when the card refund
 *   returns the last of her money, or straight away for Care Points.
 */

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/pricing-config.service', () => ({
  buildBreakdown: jest.fn(),
  getPricingInputs: jest.fn(),
}));

jest.mock('@backend/services/reward.service', () => ({
  getRewardConfig: jest.fn(),
  getOrCreateWallet: jest.fn(),
  applyBookingRedemption: jest.fn(),
  refundBookingRedemption: jest.fn(),
  grantPoints: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/package-hours.service', () => ({
  getAvailableHours: jest.fn(),
  reapplyPackageHoursForBooking: jest.fn(),
  refundPackageHours: jest.fn(),
}));

jest.mock('@backend/services/promo-code.service', () => ({
  validatePromoCode: jest.fn(),
}));

// Keep the real refundPosition / sumCapturedPaid — they decide what is
// refundable, which is the rule under test. Only the detail fetch is stubbed.
jest.mock('@backend/services/admin-booking.service', () => ({
  ...jest.requireActual('@backend/services/admin-booking.service'),
  getAdminBooking: jest.fn(),
}));

jest.mock('@backend/services/payment-refund.service', () => ({
  refundBookingPayment: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/booking.service', () => ({
  assertNoConflict: jest.fn(),
  computeDurationHours: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { getAdminBooking } from '@backend/services/admin-booking.service';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { refundBookingPayment } from '@backend/services/payment-refund.service';
import { grantPoints } from '@backend/services/reward.service';
import { refundBooking } from '@backend/services/admin-booking-edit.service';

const ADMIN_UID = 'fb-admin';
const ADMIN_ID = 3;
const MOTHER_ID = 10;

/** Prisma.Decimal stand-in — the service only ever calls `.toNumber()`. */
const dec = (n: number) => ({ toNumber: () => n });

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  booking: { findFirst: jest.Mock; updateMany: jest.Mock };
};
const mockRefundPayment = refundBookingPayment as jest.Mock;
const mockGrantPoints = grantPoints as jest.Mock;
const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const START = new Date('2026-08-02T08:00:00.000Z');

const payment = (amount: number, refunded = 0, status = 'CAPTURED') => ({
  amount: dec(amount),
  refundedAmount: dec(refunded),
  status,
});

/** A booking re-priced by an edit to EGP 600 after she paid 800 — EGP 200 overpaid. */
function overpaidBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    status: PrismaBookingStatus.CONFIRMED,
    motherId: MOTHER_ID,
    mother: { id: MOTHER_ID },
    totalAmount: dec(600),
    cancelledById: null,
    cancelledAt: null,
    startTime: START,
    payments: [payment(800)],
    ...overrides,
  };
}

/** A EGP 300 booking the admin cancelled two days out, after she paid in full. */
function cancelledBooking(overrides: Record<string, unknown> = {}) {
  return overpaidBooking({
    status: PrismaBookingStatus.CANCELLED,
    totalAmount: dec(300),
    cancelledById: ADMIN_ID,
    cancelledAt: new Date('2026-07-31T08:00:00.000Z'),
    payments: [payment(300)],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.booking.findFirst.mockResolvedValue(overpaidBooking());
  mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
  mockRefundPayment.mockReset().mockResolvedValue(undefined);
  mockGrantPoints.mockReset().mockResolvedValue(undefined);
  (getPlatformConfig as jest.Mock).mockResolvedValue({
    cancellationWindowHours: 24,
    cancellationFeePercent: 50,
  });
  (getAdminBooking as jest.Mock).mockResolvedValue({ id: 4 });
});

describe('refundBooking — who and what can be refunded', () => {
  it('rejects a caller who is not staff', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      refundBooking(4, 'fb-mother', { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('only ever acts as staff', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          firebaseUid: ADMIN_UID,
          deletedAt: null,
          role: { in: ['ADMIN', 'SUPERUSER', 'OPERATOR'] },
        },
      }),
    );
  });

  it('404s on a booking that does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses a live booking that is not overpaid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(overpaidBooking({ payments: [payment(600)] }));

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'There is no overpayment to refund on this booking.',
    });
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('refuses a live booking whose overpayment was already refunded to the card', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      overpaidBooking({ payments: [payment(800, 200)] }),
    );

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 100, reason: 'x' }),
    ).rejects.toThrow('There is no overpayment to refund on this booking.');
    expect(mockGrantPoints).not.toHaveBeenCalled();
  });

  it('refuses a booking that is already REFUNDED — the status that stops a second payout', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({ status: PrismaBookingStatus.REFUNDED }),
    );

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 100, reason: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'There is nothing left to refund on this booking.',
    });
    expect(mockGrantPoints).not.toHaveBeenCalled();
  });

  it('refuses a cancelled booking she never paid for', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(cancelledBooking({ payments: [] }));

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toThrow('There is nothing left to refund on this booking.');
  });

  it('does not count a payment that never captured as paid', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({ payments: [payment(300, 0, 'PENDING'), payment(300, 0, 'FAILED')] }),
    );

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toThrow('There is nothing left to refund on this booking.');
  });

  it('refuses a cancelled booking already refunded in full to the card', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({ payments: [payment(300, 300, 'REFUNDED')] }),
    );

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toThrow('There is nothing left to refund on this booking.');
  });
});

describe('refundBooking — card refund of an overpayment', () => {
  it('refunds the whole overpayment when no amount is given', async () => {
    const res = await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'Edit lowered price' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 200 });
    expect(res).toEqual({
      method: 'PAYMOB',
      refundedAmount: 200,
      grantedPoints: null,
      booking: { id: 4 },
    });
  });

  it('refunds part of it when the admin chooses an amount', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 50, reason: 'x' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 50 });
  });

  it('never refunds more than the overpayment', async () => {
    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 200.01, reason: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'The refund cannot exceed the overpaid amount (EGP 200.00).',
    });
    expect(mockRefundPayment).not.toHaveBeenCalled();
  });

  it('rounds the amount to 2dp before checking and sending it', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 200.004, reason: 'x' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 200 });
  });

  it('refunds only what is still overpaid after an earlier partial refund', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      overpaidBooking({ payments: [payment(800, 150)] }),
    );

    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 50 });
  });

  it('never moves a live booking to REFUNDED', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' });

    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('tells the mother how much is coming back and why', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'Shorter booking' });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MOTHER_ID,
        type: 'BOOKING_REFUNDED',
        title: 'Refund initiated',
        body: expect.stringMatching(/^We've initiated a refund of EGP 200\.00 to your card\..*Reason: Shorter booking$/),
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      MOTHER_ID,
      expect.objectContaining({ data: expect.objectContaining({ type: 'booking_refunded', bookingId: '4' }) }),
    );
  });

  it('sends no notification when the card refund fails', async () => {
    mockRefundPayment.mockRejectedValue(new Error('Paymob down'));

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toThrow('Paymob down');
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('refundBooking — card refund of a cancelled booking', () => {
  beforeEach(() => {
    mockPrisma.booking.findFirst.mockResolvedValue(cancelledBooking());
  });

  it('refunds everything she paid and settles the booking as REFUNDED', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'Nanny unavailable' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 300 });
    expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 4, status: 'CANCELLED', deletedAt: null },
      data: { status: 'REFUNDED' },
    });
    // Settled only after the money moved.
    expect(mockRefundPayment.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.booking.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('settles it when the amount returns the last of her money', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 300, reason: 'x' });

    expect(mockPrisma.booking.updateMany).toHaveBeenCalledTimes(1);
  });

  it('leaves it CANCELLED after a partial refund, so the rest can still be returned', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 150, reason: 'x' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 150 });
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('settles it when a second refund returns the remainder', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({ payments: [payment(300, 150, 'REFUNDED')] }),
    );

    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 150 });
    expect(mockPrisma.booking.updateMany).toHaveBeenCalledTimes(1);
  });

  it('never refunds more than she paid', async () => {
    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', amount: 300.5, reason: 'x' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'The refund cannot exceed what the mother paid (EGP 300.00).',
    });
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('lets the admin refund in full even when the policy would keep a late-cancellation fee', async () => {
    // She cancelled herself an hour before the start: the policy SUGGESTS 50%
    // back, but the admin decides and everything she paid stays refundable.
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({
        cancelledById: MOTHER_ID,
        cancelledAt: new Date(START.getTime() - 3_600_000),
      }),
    );

    await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'Goodwill' });

    expect(mockRefundPayment).toHaveBeenCalledWith({ bookingId: 4, amountEgp: 300 });
  });

  it('does not fail after the money moved if another settlement already won', async () => {
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    const res = await refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' });

    expect(res.refundedAmount).toBe(300);
    expect(mockNotify).toHaveBeenCalled();
  });

  it('does not settle the booking when the card refund fails', async () => {
    mockRefundPayment.mockRejectedValue(new Error('declined'));

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'PAYMOB', reason: 'x' }),
    ).rejects.toThrow('declined');
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe('refundBooking — Care Points', () => {
  it('settles a cancelled booking as REFUNDED before granting, so a double click cannot pay twice', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(cancelledBooking());

    const res = await refundBooking(4, ADMIN_UID, {
      method: 'CARE_POINTS',
      points: 450,
      reason: 'Nanny unavailable',
    });

    expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 4, status: 'CANCELLED', deletedAt: null },
      data: { status: 'REFUNDED' },
    });
    expect(mockPrisma.booking.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mockGrantPoints.mock.invocationCallOrder[0]!,
    );
    expect(mockGrantPoints).toHaveBeenCalledWith({
      userId: MOTHER_ID,
      points: 450,
      reason: 'Cancelled booking: Nanny unavailable',
      adminId: ADMIN_ID,
    });
    expect(res).toEqual({
      method: 'CARE_POINTS',
      refundedAmount: null,
      grantedPoints: 450,
      booking: { id: 4 },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'You received Care Points',
        body: '450 Care Points were added to your balance for your cancelled booking: Nanny unavailable',
      }),
    );
  });

  it('settles a cancelled booking even after a partial card refund', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      cancelledBooking({ payments: [payment(300, 100, 'REFUNDED')] }),
    );

    await refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 50, reason: 'rest' });

    expect(mockPrisma.booking.updateMany).toHaveBeenCalledTimes(1);
    expect(mockGrantPoints).toHaveBeenCalled();
  });

  it('grants nothing when another settlement won the race', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(cancelledBooking());
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 450, reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'This booking has already been settled.' });
    expect(mockGrantPoints).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('grants points for an overpayment without touching the booking status', async () => {
    await refundBooking(4, ADMIN_UID, { method: 'CARE_POINTS', points: 200, reason: 'Shorter booking' });

    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(mockGrantPoints).toHaveBeenCalledWith(
      expect.objectContaining({ points: 200, reason: 'Booking refund: Shorter booking' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        body: '200 Care Points were added to your balance for a booking adjustment: Shorter booking',
      }),
    );
  });
});
