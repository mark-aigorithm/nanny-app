import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
}));

jest.mock('@backend/services/duration-rule.service', () => ({
  listActiveDurationRules: jest.fn().mockResolvedValue([]),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  approveBooking,
  getAdminBooking,
  listAdminBookings,
  netAmountPaid,
  rejectBooking,
  setBookingStatus,
  sumCapturedPaid,
  updateBookingTimes,
} from '@backend/services/admin-booking.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  booking: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
};
const mockNotify = createInAppNotification as jest.Mock;

const ADMIN_UID = 'fb-admin';
const ADMIN_ID = 3;

const dec = (n: number) => ({ toNumber: () => n });

function makeRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2026-08-01T10:00:00.000Z');
  return {
    id: 4,
    status: PrismaBookingStatus.PENDING,
    nannyDecision: 'PENDING',
    type: 'STANDARD',
    date: start,
    startTime: start,
    endTime: new Date('2026-08-01T13:00:00.000Z'),
    durationHours: dec(3),
    baseRate: dec(100),
    effectiveHourlyRate: dec(100),
    childrenCount: 1,
    extraChildren: 0,
    extraChildFeePerHour: dec(0),
    bookedChildren: [{ name: 'Lina', ageYears: 3 }],
    subtotal: dec(300),
    durationMultiplier: dec(1),
    serviceFeePercent: dec(6),
    serviceFeeAmount: dec(18),
    totalAmount: dec(318),
    nannyAmount: dec(254),
    platformAmount: dec(64),
    discountAmount: dec(0),
    // Non-nullable Decimals with a DB default, so a real row always carries
    // them — and the detail DTO calls .toNumber() on both.
    rewardCreditHoursApplied: dec(0),
    packageHoursApplied: dec(0),
    refundedAsPointsAmount: dec(0),
    refundedAsPointsAt: null,
    selectedSkillFees: [],
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    adminApprovedAt: null,
    nannyDecidedAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    startPin: null,
    startPinExpiresAt: null,
    promoCode: null,
    payments: [{ status: 'PENDING' }],
    mother: { id: 10, firstName: 'Jane', lastName: 'Mom', phone: '+201000000000' },
    nannyProfileId: 19,
    nannyProfile: {
      id: 19,
      user: { id: 16, firstName: 'Elena', lastName: 'Nanny' },
    },
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
});

describe('approveBooking', () => {
  it('approves PENDING → APPROVED even when the nanny DECLINED', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ nannyDecision: 'DECLINED' }),
    );
    mockPrisma.booking.update.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.APPROVED, nannyDecision: 'DECLINED' }),
    );

    const result = await approveBooking(4, ADMIN_UID);

    expect(result.status).toBe('APPROVED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('APPROVED');
    expect(updateData.adminApprovedById).toBe(ADMIN_ID);
    expect(updateData.adminApprovedAt).toBeInstanceOf(Date);

    // Mother is prompted to pay; nanny is informed.
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 16, type: 'BOOKING_APPROVED' }),
    );
  });

  it('rejects approving an unclaimed booking (no nanny assigned)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ nannyProfileId: null, nannyProfile: null }),
    );

    await expect(approveBooking(4, ADMIN_UID)).rejects.toThrow(
      /Assign a nanny/i,
    );
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('rejects approving a booking that is not PENDING', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.APPROVED }),
    );

    await expect(approveBooking(4, ADMIN_UID)).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

describe('rejectBooking', () => {
  it('cancels the booking with a reason and notifies both parties', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeRow());
    mockPrisma.booking.update.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.CANCELLED }),
    );

    const result = await rejectBooking(4, ADMIN_UID, { reason: 'Fully booked' });

    expect(result.status).toBe('CANCELLED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('CANCELLED');
    expect(updateData.cancellationReason).toBe('Fully booked');
    expect(updateData.cancelledById).toBe(ADMIN_ID);
    expect(updateData.adminActionById).toBe(ADMIN_ID);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'BOOKING_CANCELLED' }),
    );
  });
});

describe('setBookingStatus', () => {
  it('is blocked when the booking is COMPLETED (locked)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      setBookingStatus(4, ADMIN_UID, { status: 'CANCELLED' }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('applies a valid override and stamps the admin audit trail', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.APPROVED }),
    );
    mockPrisma.booking.update.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.CANCELLED }),
    );

    const result = await setBookingStatus(4, ADMIN_UID, { status: 'CANCELLED' });

    expect(result.status).toBe('CANCELLED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('CANCELLED');
    expect(updateData.adminActionBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(updateData.cancelledBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: 'BOOKING_CANCELLED' }),
    );
  });

  it('rejects an invalid transition (PENDING → IN_PROGRESS)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.PENDING }),
    );

    await expect(
      setBookingStatus(4, ADMIN_UID, { status: 'IN_PROGRESS' }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

describe('updateBookingTimes', () => {
  it('recomputes duration + price from the new window and stamps the admin', async () => {
    mockPrisma.booking.findFirst
      .mockResolvedValueOnce(makeRow()) // findAdminBooking
      .mockResolvedValueOnce(null); // assertNoConflict: no clash
    mockPrisma.booking.update.mockResolvedValue(
      makeRow({ durationHours: dec(4), totalAmount: dec(424) }),
    );

    await updateBookingTimes(4, ADMIN_UID, {
      startTime: '2026-08-02T10:00:00',
      endTime: '2026-08-02T14:00:00', // 4 hours
    });

    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    // 10:00 Cairo in August is +03:00, so the stored instant is 07:00Z.
    expect(updateData.startTime).toEqual(new Date('2026-08-02T07:00:00.000Z'));
    expect(updateData.date).toEqual(new Date('2026-08-02T00:00:00.000Z'));
    expect(updateData.durationHours).toBe(4);
    // rate 100 × 4h = 400 subtotal; split 80/20, no fee on top.
    expect(updateData.subtotal).toBe(400);
    expect(updateData.serviceFeeAmount).toBe(0);
    expect(updateData.totalAmount).toBe(400);
    expect(updateData.nannyAmount).toBe(320);
    expect(updateData.platformAmount).toBe(80);
    expect(updateData.adminActionBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10 }),
    );
  });

  it('rejects editing a COMPLETED booking (locked)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      updateBookingTimes(4, ADMIN_UID, {
        startTime: '2026-08-02T10:00:00',
        endTime: '2026-08-02T14:00:00',
      }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('rejects a window shorter than the minimum duration', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());

    await expect(
      updateBookingTimes(4, ADMIN_UID, {
        startTime: '2026-08-02T10:00:00',
        endTime: '2026-08-02T10:30:00', // 0.5 h
      }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

describe('listAdminBookings (paginated)', () => {
  it('maps discountAmount and the applied promo code', async () => {
    mockPrisma.booking.count.mockResolvedValue(1);
    mockPrisma.booking.findMany.mockResolvedValue([
      makeRow({ discountAmount: dec(50), promoCode: { code: 'SAVE50' } }),
    ]);

    const { bookings } = await listAdminBookings('ALL', { page: 1, limit: 20 });

    expect(bookings[0]?.discountAmount).toBe(50);
    expect(bookings[0]?.promoCode).toBe('SAVE50');
  });

  it('reports a null promo code when none was applied', async () => {
    mockPrisma.booking.count.mockResolvedValue(1);
    mockPrisma.booking.findMany.mockResolvedValue([makeRow()]);

    const { bookings } = await listAdminBookings('ALL', { page: 1, limit: 20 });

    expect(bookings[0]?.discountAmount).toBe(0);
    expect(bookings[0]?.promoCode).toBeNull();
  });

  it('applies skip/take for the requested page and returns pagination meta', async () => {
    mockPrisma.booking.count.mockResolvedValue(57);
    mockPrisma.booking.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listAdminBookings('ALL', { page: 3, limit: 10 });

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(meta).toEqual({ page: 3, limit: 10, total: 57, totalPages: 6 });
  });
});

describe('netAmountPaid', () => {
  const captured = (amount: number, refunded = 0) =>
    ({ amount: dec(amount), refundedAmount: dec(refunded), status: 'CAPTURED' }) as never;

  it('takes an overpayment returned as points off what she has effectively paid', () => {
    const booking = { payments: [captured(600)], refundedAsPointsAmount: dec(200) } as never;

    // The cash figure is unchanged — only the net one moves.
    expect(sumCapturedPaid([captured(600)])).toBe(600);
    expect(netAmountPaid(booking)).toBe(400);
  });

  it('stacks with a card refund on the same booking', () => {
    const booking = { payments: [captured(600, 100)], refundedAsPointsAmount: dec(200) } as never;

    expect(netAmountPaid(booking)).toBe(300);
  });

  it('is just the cash when nothing was settled as points', () => {
    const booking = { payments: [captured(318)], refundedAsPointsAmount: dec(0) } as never;

    expect(netAmountPaid(booking)).toBe(318);
  });
});

describe('getAdminBooking (detail)', () => {
  it('returns the full breakdown, payment record, and a null pointsRedeemed', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        mother: {
          id: 10,
          firstName: 'Jane',
          lastName: 'Mom',
          email: 'jane@example.com',
          phone: '+201000000000',
        },
        nannyProfile: {
          id: 19,
          user: {
            id: 16,
            firstName: 'Elena',
            lastName: 'Nanny',
            email: 'elena@example.com',
            phone: '+201111111111',
          },
        },
        selectedSkillFees: [],
        nannyAmount: dec(254),
        platformAmount: dec(64),
        payments: [
          {
            status: 'CAPTURED',
            method: 'CARD',
            amount: dec(318),
            currency: 'EGP',
            paymobOrderId: 'ord-1',
            paymobTransactionId: 'txn-1',
            paymobIntentionId: 'int-1',
            failureReason: null,
            refundedAmount: dec(0),
            refundedAt: null,
          },
        ],
      }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.mother.email).toBe('jane@example.com');
    expect(dto.nanny?.email).toBe('elena@example.com');
    expect(dto.nannyAmount).toBe(254);
    expect(dto.platformAmount).toBe(64);
    expect(dto.payment).toMatchObject({ status: 'CAPTURED', method: 'CARD', amount: 318 });
    expect(dto.pointsRedeemed).toBeNull();
  });

  it('throws when the booking does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    await expect(getAdminBooking(999)).rejects.toThrow(AppError);
  });

  function capturedPayment(amount: number, refunded = 0, overrides: Record<string, unknown> = {}) {
    return {
      status: 'CAPTURED',
      method: 'CARD',
      amount: dec(amount),
      currency: 'EGP',
      paymobOrderId: 'ord-1',
      paymobTransactionId: 'txn-1',
      paymobIntentionId: 'int-1',
      failureReason: null,
      refundedAmount: dec(refunded),
      refundedAt: null,
      ...overrides,
    };
  }

  it('reports the overpayment once an edit has priced the booking below what was paid', async () => {
    // Paid 318 for three hours; an admin then shortened it to 212 worth.
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ totalAmount: dec(212), payments: [capturedPayment(318)] }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.amountPaid).toBe(318);
    expect(dto.refundableAmount).toBe(106);
  });

  it('nets refunds and top-ups across every payment, not just the newest', async () => {
    // Newest first, as the include orders them: a 100 top-up, then the original
    // 318 of which 50 already went back. Total is 300 → 368 kept, 68 over.
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        totalAmount: dec(300),
        payments: [
          capturedPayment(100, 0, { paymobTransactionId: 'txn-2' }),
          capturedPayment(318, 50, { status: 'CAPTURED' }),
        ],
      }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.amountPaid).toBe(368);
    expect(dto.refundableAmount).toBe(68);
    // The payment card still shows the newest attempt.
    expect(dto.payment?.paymobTransactionId).toBe('txn-2');
  });

  it('stops reporting an overpayment that was settled as Care Points', async () => {
    // The same 106 overpayment as above, given back as points instead of money.
    // It is no longer refundable, but the page still has to say where it went.
    const settledAt = new Date('2026-08-02T09:00:00.000Z');
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        totalAmount: dec(212),
        payments: [capturedPayment(318)],
        refundedAsPointsAmount: dec(106),
        refundedAsPointsAt: settledAt,
      }),
    );

    const dto = await getAdminBooking(4);

    // amountPaid stays the cash she handed over; the points come off separately.
    expect(dto.amountPaid).toBe(318);
    expect(dto.refundedAsPointsAmount).toBe(106);
    expect(dto.refundedAsPointsAt).toBe(settledAt.toISOString());
    expect(dto.refundableAmount).toBe(0);
  });

  it('offers back only the part of an overpayment not yet settled as points', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        totalAmount: dec(212),
        payments: [capturedPayment(318)],
        refundedAsPointsAmount: dec(40),
      }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.refundableAmount).toBe(66); // 318 − 40 − 212
  });

  it('reports nothing refundable while the booking is unpaid or paid exactly', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ totalAmount: dec(318), payments: [capturedPayment(318)] }),
    );
    const paidExactly = await getAdminBooking(4);
    expect(paidExactly.refundableAmount).toBe(0);

    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ payments: [capturedPayment(318, 0, { status: 'PENDING' })] }),
    );
    const unpaid = await getAdminBooking(4);
    expect(unpaid.amountPaid).toBe(0);
    expect(unpaid.refundableAmount).toBe(0);
  });

  it('exposes the start PIN and its expiry while the PIN is live', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ payments: [], startPin: '0042', startPinExpiresAt: expiresAt }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBe('0042');
    expect(dto.startPinExpiresAt).toBe(expiresAt.toISOString());
  });

  it('hides an expired start PIN', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        payments: [],
        startPin: '0042',
        startPinExpiresAt: new Date(Date.now() - 60_000),
      }),
    );

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBeNull();
    expect(dto.startPinExpiresAt).toBeNull();
  });

  it('returns null PIN fields when the parent has not started', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeRow({ payments: [] }));

    const dto = await getAdminBooking(4);

    expect(dto.startPin).toBeNull();
    expect(dto.startPinExpiresAt).toBeNull();
  });
});
