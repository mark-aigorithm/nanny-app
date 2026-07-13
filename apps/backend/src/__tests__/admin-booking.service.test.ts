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
  rejectBooking,
  setBookingStatus,
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
const ADMIN_ID = 'admin-9';

const dec = (n: number) => ({ toNumber: () => n });

function makeRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2026-08-01T10:00:00.000Z');
  return {
    id: 'booking-1',
    status: PrismaBookingStatus.PENDING,
    nannyDecision: 'PENDING',
    type: 'STANDARD',
    date: start,
    startTime: start,
    endTime: new Date('2026-08-01T13:00:00.000Z'),
    durationHours: dec(3),
    baseRate: dec(100),
    effectiveHourlyRate: dec(100),
    subtotal: dec(300),
    durationMultiplier: dec(1),
    serviceFeePercent: dec(6),
    serviceFeeAmount: dec(18),
    totalAmount: dec(318),
    nannyAmount: dec(254),
    platformAmount: dec(64),
    discountAmount: dec(0),
    selectedSkillFees: [],
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    adminApprovedAt: null,
    nannyDecidedAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    promoCode: null,
    payment: { status: 'PENDING' },
    mother: { id: 'mother-1', firstName: 'Jane', lastName: 'Mom', phone: '+201000000000' },
    nannyProfileId: 'np-1',
    nannyProfile: {
      id: 'np-1',
      user: { id: 'nanny-user-1', firstName: 'Elena', lastName: 'Nanny' },
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

    const result = await approveBooking('booking-1', ADMIN_UID);

    expect(result.status).toBe('APPROVED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('APPROVED');
    expect(updateData.adminApprovedById).toBe(ADMIN_ID);
    expect(updateData.adminApprovedAt).toBeInstanceOf(Date);

    // Mother is prompted to pay; nanny is informed.
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'mother-1', type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'nanny-user-1', type: 'BOOKING_APPROVED' }),
    );
  });

  it('rejects approving an unclaimed booking (no nanny assigned)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ nannyProfileId: null, nannyProfile: null }),
    );

    await expect(approveBooking('booking-1', ADMIN_UID)).rejects.toThrow(
      /Assign a nanny/i,
    );
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('rejects approving a booking that is not PENDING', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.APPROVED }),
    );

    await expect(approveBooking('booking-1', ADMIN_UID)).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
});

describe('rejectBooking', () => {
  it('cancels the booking with a reason and notifies both parties', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(makeRow());
    mockPrisma.booking.update.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.CANCELLED }),
    );

    const result = await rejectBooking('booking-1', ADMIN_UID, { reason: 'Fully booked' });

    expect(result.status).toBe('CANCELLED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('CANCELLED');
    expect(updateData.cancellationReason).toBe('Fully booked');
    expect(updateData.cancelledById).toBe(ADMIN_ID);
    expect(updateData.adminActionById).toBe(ADMIN_ID);
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'mother-1', type: 'BOOKING_CANCELLED' }),
    );
  });
});

describe('setBookingStatus', () => {
  it('is blocked when the booking is COMPLETED (locked)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      setBookingStatus('booking-1', ADMIN_UID, { status: 'CANCELLED' }),
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

    const result = await setBookingStatus('booking-1', ADMIN_UID, { status: 'CANCELLED' });

    expect(result.status).toBe('CANCELLED');
    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('CANCELLED');
    expect(updateData.adminActionBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(updateData.cancelledBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'mother-1', type: 'BOOKING_CANCELLED' }),
    );
  });

  it('rejects an invalid transition (PENDING → IN_PROGRESS)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.PENDING }),
    );

    await expect(
      setBookingStatus('booking-1', ADMIN_UID, { status: 'IN_PROGRESS' }),
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

    await updateBookingTimes('booking-1', ADMIN_UID, {
      startTime: '2026-08-02T10:00:00.000Z',
      endTime: '2026-08-02T14:00:00.000Z', // 4 hours
    });

    const updateData = mockPrisma.booking.update.mock.calls[0][0].data;
    expect(updateData.startTime).toEqual(new Date('2026-08-02T10:00:00.000Z'));
    expect(updateData.durationHours).toBe(4);
    // rate 100 × 4h = 400 subtotal; split 80/20, no fee on top.
    expect(updateData.subtotal).toBe(400);
    expect(updateData.serviceFeeAmount).toBe(0);
    expect(updateData.totalAmount).toBe(400);
    expect(updateData.nannyAmount).toBe(320);
    expect(updateData.platformAmount).toBe(80);
    expect(updateData.adminActionBy).toEqual({ connect: { id: ADMIN_ID } });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'mother-1' }),
    );
  });

  it('rejects editing a COMPLETED booking (locked)', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({ status: PrismaBookingStatus.COMPLETED }),
    );

    await expect(
      updateBookingTimes('booking-1', ADMIN_UID, {
        startTime: '2026-08-02T10:00:00.000Z',
        endTime: '2026-08-02T14:00:00.000Z',
      }),
    ).rejects.toThrow(AppError);
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('rejects a window shorter than the minimum duration', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());

    await expect(
      updateBookingTimes('booking-1', ADMIN_UID, {
        startTime: '2026-08-02T10:00:00.000Z',
        endTime: '2026-08-02T10:30:00.000Z', // 0.5 h
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

describe('getAdminBooking (detail)', () => {
  it('returns the full breakdown, payment record, and a null pointsRedeemed', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(
      makeRow({
        mother: {
          id: 'mother-1',
          firstName: 'Jane',
          lastName: 'Mom',
          email: 'jane@example.com',
          phone: '+201000000000',
        },
        nannyProfile: {
          id: 'np-1',
          user: {
            id: 'nanny-user-1',
            firstName: 'Elena',
            lastName: 'Nanny',
            email: 'elena@example.com',
            phone: '+201111111111',
          },
        },
        selectedSkillFees: [],
        nannyAmount: dec(254),
        platformAmount: dec(64),
        payment: {
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
      }),
    );

    const dto = await getAdminBooking('booking-1');

    expect(dto.mother.email).toBe('jane@example.com');
    expect(dto.nanny?.email).toBe('elena@example.com');
    expect(dto.nannyAmount).toBe(254);
    expect(dto.platformAmount).toBe(64);
    expect(dto.payment).toMatchObject({ status: 'CAPTURED', method: 'CARD', amount: 318 });
    expect(dto.pointsRedeemed).toBeNull();
  });

  it('throws when the booking does not exist', async () => {
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    await expect(getAdminBooking('missing')).rejects.toThrow(AppError);
  });
});
