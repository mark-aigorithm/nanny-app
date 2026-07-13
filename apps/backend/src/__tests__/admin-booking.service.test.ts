import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
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
  listAdminBookings,
  rejectBooking,
  setBookingStatus,
  updateBookingTimes,
} from '@backend/services/admin-booking.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  booking: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
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
    serviceFeePercent: dec(6),
    serviceFeeAmount: dec(18),
    totalAmount: dec(318),
    discountAmount: dec(0),
    promoCode: null,
    payment: { status: 'PENDING' },
    mother: { id: 'mother-1', firstName: 'Jane', lastName: 'Mom', phone: '+201000000000' },
    nannyProfileId: 'np-1',
    nannyProfile: {
      id: 'np-1',
      user: { id: 'nanny-user-1', firstName: 'Elena', lastName: 'Nanny' },
    },
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
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

describe('admin booking DTO promo fields', () => {
  it('maps discountAmount and the applied promo code', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([
      makeRow({ discountAmount: dec(50), promoCode: { code: 'SAVE50' } }),
    ]);

    const [dto] = await listAdminBookings('ALL');

    expect(dto.discountAmount).toBe(50);
    expect(dto.promoCode).toBe('SAVE50');
  });

  it('reports a null promo code when none was applied', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([makeRow()]);

    const [dto] = await listAdminBookings('ALL');

    expect(dto.discountAmount).toBe(0);
    expect(dto.promoCode).toBeNull();
  });
});
