import { Role, BookingStatus } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import { hashPin } from '@backend/lib/pin';
import {
  CHECK_IN_EARLY_MINUTES,
  START_PIN_MAX_ATTEMPTS,
  checkInBooking,
  checkOutBooking,
  generateStartPin,
} from '@backend/services/booking.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    // Closing a shift releases any extension still in flight; none here.
    bookingExtension: { findMany: jest.fn().mockResolvedValue([]) },
    // getBookingResponseContext (via toBookingResponse) reads the platform
    // config; empty → every field falls back to its default.
    appSettings: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
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
  booking: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const DEFAULT_PIN = '1234';

const nannyUser = {
  id: 16,
  firebaseUid: 'firebase-nanny',
  role: Role.NANNY,
  deletedAt: null,
};

const motherUser = {
  id: 10,
  firebaseUid: 'firebase-mother',
  role: Role.MOTHER,
  deletedAt: null,
};

const mother = {
  id: 10,
  firstName: 'Jane',
  lastName: 'Mom',
  avatarUrl: null,
};

const nannyProfileUser = {
  firstName: 'Elena',
  lastName: 'Nanny',
  avatarUrl: null,
  address: null,
};

function makeBooking(overrides: Partial<{
  status: string;
  startTime: Date;
  endTime: Date;
  startPinHash: string | null;
  startPinExpiresAt: Date | null;
  startPinAttempts: number;
}> = {}) {
  const startTime = overrides.startTime ?? new Date(Date.now() + 10 * 60_000);
  const endTime = overrides.endTime ?? new Date(startTime.getTime() + 3 * 3_600_000);
  return {
    id: 4,
    motherId: mother.id,
    status: overrides.status ?? PrismaBookingStatus.CONFIRMED,
    startTime,
    endTime,
    date: startTime,
    mother,
    nannyProfile: {
      id: 19,
      userId: nannyUser.id,
      user: nannyProfileUser,
    },
    payments: [],
    // Matches bookingInclude: the relation is always present, empty by default.
    extensions: [],
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
    startPinHash:
      overrides.startPinHash === undefined ? hashPin(DEFAULT_PIN) : overrides.startPinHash,
    startPinGeneratedAt: new Date(),
    startPinExpiresAt:
      overrides.startPinExpiresAt === undefined
        ? new Date(Date.now() + 20 * 60_000)
        : overrides.startPinExpiresAt,
    startPinAttempts: overrides.startPinAttempts ?? 0,
    createdAt: new Date(),
  };
}

describe('booking shift transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
  });

  describe('generateStartPin', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    });

    it('returns a 4-digit PIN and persists only its hash (attempts reset)', async () => {
      const booking = makeBooking({ startPinHash: null, startPinExpiresAt: null });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);
      mockPrisma.booking.update.mockResolvedValue(booking);

      const result = await generateStartPin({ uid: 'firebase-mother' } as never, 4);

      expect(result.pin).toMatch(/^\d{4}$/);
      expect(typeof result.expiresAt).toBe('string');
      const data = mockPrisma.booking.update.mock.calls[0][0].data;
      expect(data.startPinHash).toBe(hashPin(result.pin));
      expect(data.startPinHash).not.toBe(result.pin);
      expect(data.startPinAttempts).toBe(0);
    });

    it('rejects a non-mother caller', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
      mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());

      await expect(
        generateStartPin({ uid: 'firebase-nanny' } as never, 4),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects a mother who does not own the booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        ...makeBooking(),
        motherId: 28,
      });

      await expect(
        generateStartPin({ uid: 'firebase-mother' } as never, 4),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects when the booking is not CONFIRMED', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(
        makeBooking({ status: PrismaBookingStatus.PENDING }),
      );

      await expect(
        generateStartPin({ uid: 'firebase-mother' } as never, 4),
      ).rejects.toThrow(AppError);
    });

    it('rejects outside the check-in window (too early)', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startTime: new Date(Date.now() + 60 * 60_000) }),
      );

      await expect(
        generateStartPin({ uid: 'firebase-mother' } as never, 4),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
  });

  describe('checkInBooking', () => {
    it('transitions CONFIRMED to IN_PROGRESS with the correct PIN and clears it', async () => {
      const booking = makeBooking();
      const updated = {
        ...booking,
        status: PrismaBookingStatus.IN_PROGRESS,
        nannyCheckedInAt: new Date(),
      };
      mockPrisma.booking.findUnique.mockResolvedValue(booking);
      mockPrisma.booking.update.mockResolvedValue(updated);

      const result = await checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN);

      expect(result.status).toBe(BookingStatus.IN_PROGRESS);
      const data = mockPrisma.booking.update.mock.calls[0][0].data;
      expect(data.status).toBe(PrismaBookingStatus.IN_PROGRESS);
      expect(data.startPinHash).toBeNull();
      expect(data.startPinExpiresAt).toBeNull();
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mother.id, type: 'NANNY_CHECKIN' }),
      );
      expect(mockPush).toHaveBeenCalledWith(
        mother.id,
        expect.objectContaining({
          // FCM push data is always Record<string,string>, so the id is stringified.
          data: expect.objectContaining({ bookingId: '4' }),
        }),
      );
    });

    it('rejects when the parent has not started (no PIN)', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startPinHash: null, startPinExpiresAt: null }),
      );

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects an expired PIN', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startPinExpiresAt: new Date(Date.now() - 60_000) }),
      );

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong PIN and increments the attempt counter', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, '9999'),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { startPinAttempts: { increment: 1 } },
        }),
      );
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects once the attempt cap is reached', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue(
        makeBooking({ startPinAttempts: START_PIN_MAX_ATTEMPTS }),
      );

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN),
      ).rejects.toThrow(AppError);
      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects check-in too early', async () => {
      const booking = makeBooking({
        startTime: new Date(Date.now() + 60 * 60_000),
      });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN),
      ).rejects.toThrow(AppError);

      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });

    it('rejects check-in when not CONFIRMED', async () => {
      const booking = makeBooking({ status: PrismaBookingStatus.PENDING });
      mockPrisma.booking.findUnique.mockResolvedValue(booking);

      await expect(
        checkInBooking({ uid: 'firebase-nanny' } as never, 4, DEFAULT_PIN),
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

      const result = await checkOutBooking({ uid: 'firebase-nanny' } as never, 4);

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
        checkOutBooking({ uid: 'firebase-nanny' } as never, 4),
      ).rejects.toThrow(AppError);

      expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    });
  });

  it('exports CHECK_IN_EARLY_MINUTES as 15', () => {
    expect(CHECK_IN_EARLY_MINUTES).toBe(15);
  });
});
