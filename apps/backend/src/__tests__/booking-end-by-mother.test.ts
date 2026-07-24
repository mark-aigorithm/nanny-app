import { Role } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import { endBookingByMother } from '@backend/services/booking.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    booking: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    bookingExtension: { findMany: jest.fn().mockResolvedValue([]) },
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

// The two best-effort side effects a completed booking triggers. Stubbed so
// this suite can assert they RAN without dragging in the rewards/referral graph.
jest.mock('@backend/services/reward.service', () => ({
  applyBookingRedemption: jest.fn(),
  awardPointsForBooking: jest.fn().mockResolvedValue(undefined),
  notifyPointsRedeemed: jest.fn().mockResolvedValue(undefined),
  notifyPointsRefunded: jest.fn().mockResolvedValue(undefined),
  refundBookingRedemption: jest.fn(),
}));

jest.mock('@backend/services/referral.service', () => ({
  convertReferralForBooking: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { awardPointsForBooking } from '@backend/services/reward.service';
import { convertReferralForBooking } from '@backend/services/referral.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  booking: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  bookingExtension: { findMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;
const mockAward = awardPointsForBooking as jest.Mock;
const mockReferral = convertReferralForBooking as jest.Mock;

const motherUser = { id: 10, firebaseUid: 'firebase-mother', role: Role.MOTHER, deletedAt: null };
const nannyUser = { id: 16, firebaseUid: 'firebase-nanny', role: Role.NANNY, deletedAt: null };
const otherMother = { id: 11, firebaseUid: 'firebase-other', role: Role.MOTHER, deletedAt: null };

const mother = { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null };

function makeBooking(status: string = PrismaBookingStatus.IN_PROGRESS) {
  const startTime = new Date(Date.now() - 60 * 60_000);
  return {
    id: 4,
    motherId: mother.id,
    status,
    startTime,
    endTime: new Date(startTime.getTime() + 3 * 3_600_000),
    date: startTime,
    mother,
    nannyProfile: {
      id: 19,
      userId: nannyUser.id,
      user: { firstName: 'Elena', lastName: 'Nanny', avatarUrl: null, address: null, phone: null },
    },
    payments: [],
    extensions: [],
    type: 'STANDARD',
    durationHours: 3,
    baseRate: 100,
    effectiveHourlyRate: 100,
    childrenCount: 1,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    bookedChildren: [{ name: null, ageYears: 4 }],
    subtotal: 300,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 300,
    nannyAmount: 210,
    platformAmount: 90,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    selectedSkillFees: null,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: startTime,
    nannyCheckedOutAt: null,
    motherEndedAt: null,
    startPinHash: null,
    startPinGeneratedAt: null,
    startPinExpiresAt: null,
    startPinAttempts: 0,
    nannyDecision: 'ACCEPTED',
    nannyDecidedAt: startTime,
    adminApprovedAt: startTime,
    review: null,
    createdAt: startTime,
  };
}

describe('endBookingByMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(motherUser);
    mockPrisma.bookingExtension.findMany.mockResolvedValue([]);
  });

  it('completes the booking and stamps motherEndedAt, not the nanny check-out', async () => {
    const booking = makeBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...booking, ...data }),
    );

    const result = await endBookingByMother({ uid: 'firebase-mother' } as never, 4);

    const { data } = mockPrisma.booking.update.mock.calls[0][0];
    expect(data.status).toBe(PrismaBookingStatus.COMPLETED);
    expect(data.motherEndedAt).toBeInstanceOf(Date);
    // The distinction the whole feature rests on: the nanny did NOT check out.
    expect(data.nannyCheckedOutAt).toBeUndefined();

    expect(result.status).toBe('COMPLETED');
    expect(result.motherEndedAt).not.toBeNull();
    expect(result.nannyCheckedOutAt).toBeNull();
  });

  it('notifies the nanny that the parent ended the shift', async () => {
    const booking = makeBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockResolvedValue({
      ...booking,
      status: PrismaBookingStatus.COMPLETED,
      motherEndedAt: new Date(),
    });

    await endBookingByMother({ uid: 'firebase-mother' } as never, 4);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: nannyUser.id, type: 'BOOKING_ENDED_BY_PARENT' }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      nannyUser.id,
      expect.objectContaining({
        data: expect.objectContaining({ type: 'booking_ended_by_parent' }),
      }),
    );
  });

  it('still awards points and converts the referral, exactly like a nanny check-out', async () => {
    const booking = makeBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockResolvedValue({
      ...booking,
      status: PrismaBookingStatus.COMPLETED,
      motherEndedAt: new Date(),
    });

    await endBookingByMother({ uid: 'firebase-mother' } as never, 4);

    expect(mockAward).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 4, motherId: mother.id }),
    );
    expect(mockReferral).toHaveBeenCalledWith(
      expect.objectContaining({ refereeUserId: mother.id, bookingId: 4 }),
    );
  });

  it('releases an extension still in flight so it cannot be paid after the shift', async () => {
    const booking = makeBooking();
    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.update.mockResolvedValue({
      ...booking,
      status: PrismaBookingStatus.COMPLETED,
      motherEndedAt: new Date(),
    });

    await endBookingByMother({ uid: 'firebase-mother' } as never, 4);

    expect(mockPrisma.bookingExtension.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingId: 4,
          status: { in: ['PENDING_NANNY', 'ACCEPTED'] },
        }),
      }),
    );
  });

  it('rejects a booking that is not under way', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking(PrismaBookingStatus.CONFIRMED),
    );

    await expect(endBookingByMother({ uid: 'firebase-mother' } as never, 4)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('rejects an already-completed booking rather than double-awarding points', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      makeBooking(PrismaBookingStatus.COMPLETED),
    );

    await expect(endBookingByMother({ uid: 'firebase-mother' } as never, 4)).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('rejects a nanny trying to end the booking through the parent route', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);

    await expect(
      endBookingByMother({ uid: 'firebase-nanny' } as never, 4),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects a mother who does not own the booking', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(otherMother);
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());

    await expect(
      endBookingByMother({ uid: 'firebase-other' } as never, 4),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('404s on a missing booking', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(null);

    await expect(
      endBookingByMother({ uid: 'firebase-mother' } as never, 999),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
