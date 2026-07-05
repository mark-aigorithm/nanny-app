import { Role, BookingStatus } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import {
  CHECK_IN_EARLY_MINUTES,
  checkInBooking,
  checkOutBooking,
} from '@backend/services/booking.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock; update: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const nannyUser = {
  id: 'nanny-user-1',
  firebaseUid: 'firebase-nanny',
  role: Role.NANNY,
  deletedAt: null,
};

const mother = {
  id: 'mother-1',
  firstName: 'Jane',
  lastName: 'Mom',
  avatarUrl: null,
};

const nannyProfileUser = {
  firstName: 'Elena',
  lastName: 'Nanny',
  avatarUrl: null,
};

function makeBooking(overrides: Partial<{
  status: string;
  startTime: Date;
  endTime: Date;
}> = {}) {
  const startTime = overrides.startTime ?? new Date(Date.now() + 10 * 60_000);
  const endTime = overrides.endTime ?? new Date(startTime.getTime() + 3 * 3_600_000);
  return {
    id: 'booking-1',
    motherId: mother.id,
    status: overrides.status ?? PrismaBookingStatus.CONFIRMED,
    startTime,
    endTime,
    date: startTime,
    mother,
    nannyProfile: {
      id: 'np-1',
      userId: nannyUser.id,
      user: nannyProfileUser,
      hourlyRate: 100,
      location: 'Cairo',
    },
    payment: null,
    type: 'STANDARD',
    durationHours: 3,
    baseRate: 100,
    subtotal: 300,
    discountAmount: 0,
    serviceFeePercent: 6,
    serviceFeeAmount: 18,
    totalAmount: 318,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    createdAt: new Date(),
  };
}

describe('booking shift transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
  });

  describe('checkInBooking', () => {
    it('transitions CONFIRMED to IN_PROGRESS and notifies mother', async () => {
      const booking = makeBooking();
      const updated = {
        ...booking,
        status: PrismaBookingStatus.IN_PROGRESS,
        nannyCheckedInAt: new Date(),
      };
      mockPrisma.booking.findUnique.mockResolvedValue(booking);
      mockPrisma.booking.update.mockResolvedValue(updated);

      const result = await checkInBooking({ uid: 'firebase-nanny' } as never, 'booking-1');

      expect(result.status).toBe(BookingStatus.IN_PROGRESS);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mother.id,
          type: 'NANNY_CHECKIN',
        }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        mother.id,
        expect.objectContaining({
          data: expect.objectContaining({ bookingId: 'booking-1' }),
        }),
      );
    });

    it('rejects check-in too early', async () => {
      const booking = makeBooking({
        startTime: new Date(Date.now() + 60 * 60_000),
      });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 'booking-1'),
      ).rejects.toThrow(AppError);

      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects check-in when not CONFIRMED', async () => {
      const booking = makeBooking({ status: PrismaBookingStatus.PENDING });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 'booking-1'),
      ).rejects.toThrow(AppError);
    });
  });

  describe('checkOutBooking', () => {
    it('transitions IN_PROGRESS to COMPLETED and notifies mother', async () => {
      const booking = makeBooking({ status: PrismaBookingStatus.IN_PROGRESS });
      const updated = {
        ...booking,
        status: PrismaBookingStatus.COMPLETED,
        nannyCheckedOutAt: new Date(),
      };
      mockPrisma.booking.findUnique.mockResolvedValue(booking);
      mockPrisma.booking.update.mockResolvedValue(updated);

      const result = await checkOutBooking({ uid: 'firebase-nanny' } as never, 'booking-1');

      expect(result.status).toBe(BookingStatus.COMPLETED);
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mother.id,
          type: 'BOOKING_COMPLETED',
        }),
      );
    });

    it('rejects check-out from CONFIRMED', async () => {
      const booking = makeBooking({ status: PrismaBookingStatus.CONFIRMED });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);

      await expect(
        checkOutBooking({ uid: 'firebase-nanny' } as never, 'booking-1'),
      ).rejects.toThrow(AppError);

      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
  });

  it('exports CHECK_IN_EARLY_MINUTES as 15', () => {
    expect(CHECK_IN_EARLY_MINUTES).toBe(15);
  });
});
