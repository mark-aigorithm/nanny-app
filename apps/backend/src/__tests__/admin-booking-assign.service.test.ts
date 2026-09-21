import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    nannyProfile: { findFirst: jest.fn(), findMany: jest.fn() },
    booking: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(0),
  getSkillMatchingEnabled: jest.fn().mockResolvedValue(true),
}));

jest.mock('@backend/services/duration-rule.service', () => ({
  listActiveDurationRules: jest.fn().mockResolvedValue([]),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  getBroadcastRadiusKm,
  getSkillMatchingEnabled,
} from '@backend/services/app-settings.service';
import {
  assignBookingNanny,
  listBookingCandidates,
} from '@backend/services/admin-booking-assign.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  nannyProfile: { findFirst: jest.Mock; findMany: jest.Mock };
  booking: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
};
const mockNotify = createInAppNotification as jest.Mock;
const mockRadius = getBroadcastRadiusKm as jest.Mock;
const mockSkillMatching = getSkillMatchingEnabled as jest.Mock;

const ADMIN_UID = 'fb-admin';
const ADMIN_ID = 3;
const dec = (n: number) => ({ toNumber: () => n });

/** A booking row as `bookingInclude` returns it (list-shaped). */
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
    totalAmount: dec(318),
    discountAmount: dec(0),
    latitude: dec(30.0444),
    longitude: dec(31.2357),
    selectedSkillFees: [],
    promoCode: null,
    payments: [{ status: 'PENDING' }],
    mother: { id: 10, firstName: 'Jane', lastName: 'Mom', phone: '+201000000000' },
    nannyProfileId: null,
    nannyProfile: null,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    ...overrides,
  };
}

const ASSIGNED = {
  nannyProfileId: 19,
  nannyProfile: { id: 19, user: { id: 16, firstName: 'Elena', lastName: 'Nanny' } },
};

/** What `prisma.nannyProfile.findFirst` returns for the nanny being assigned. */
function makeNanny(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    user: { id: 30, firstName: 'Sara', lastName: 'Near', approvalStatus: 'APPROVED', ...overrides },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockRadius.mockResolvedValue(0);
  mockSkillMatching.mockResolvedValue(true);
});

describe('assignBookingNanny', () => {
  function arrange(row: ReturnType<typeof makeRow>, nanny = makeNanny()) {
    mockPrisma.booking.findFirst
      .mockResolvedValueOnce(row) // findAdminBooking
      .mockResolvedValueOnce(null); // assertNoConflict: free
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(nanny);
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
  }

  it('assigns and approves an unclaimed PENDING request', async () => {
    arrange(makeRow());
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeRow({
        status: PrismaBookingStatus.APPROVED,
        nannyProfileId: 21,
        nannyProfile: { id: 21, user: { id: 30, firstName: 'Sara', lastName: 'Near' } },
      }),
    );

    const result = await assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 });

    expect(result.status).toBe('APPROVED');
    expect(result.nanny).toEqual({ id: 21, name: 'Sara Near' });

    const call = mockPrisma.booking.updateMany.mock.calls[0][0];
    // Guarded on what we read, so a concurrent claim makes this a no-op.
    expect(call.where).toEqual({
      id: 4,
      deletedAt: null,
      status: 'PENDING',
      nannyProfileId: null,
    });
    expect(call.data).toMatchObject({
      nannyProfileId: 21,
      nannyDecision: 'PENDING',
      nannyDecidedAt: null,
      status: 'APPROVED',
      adminApprovedById: ADMIN_ID,
      adminActionById: ADMIN_ID,
    });
    expect(call.data.adminApprovedAt).toBeInstanceOf(Date);

    // New nanny told; mother prompted to pay.
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 30, type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'BOOKING_APPROVED',
        title: 'Booking approved — complete payment',
      }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it('swaps the nanny on a CONFIRMED booking without touching its status', async () => {
    arrange(makeRow({ status: PrismaBookingStatus.CONFIRMED, ...ASSIGNED }));
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue(
      makeRow({
        status: PrismaBookingStatus.CONFIRMED,
        nannyProfileId: 21,
        nannyProfile: { id: 21, user: { id: 30, firstName: 'Sara', lastName: 'Near' } },
      }),
    );

    const result = await assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 });

    expect(result.status).toBe('CONFIRMED');
    const call = mockPrisma.booking.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ status: 'CONFIRMED', nannyProfileId: 19 });
    expect(call.data.status).toBeUndefined();
    expect(call.data.adminApprovedById).toBeUndefined();
    expect(call.data).toMatchObject({ nannyProfileId: 21, nannyDecision: 'PENDING' });

    // New nanny, old nanny, and the mother (as an edit, not an approval).
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 30, type: 'BOOKING_APPROVED' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 16, type: 'BOOKING_CANCELLED', title: 'Booking reassigned' }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'BOOKING_EDITED',
        body: 'Your nanny for 2026-08-01 is now Sara Near.',
      }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(3);
  });

  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as const)(
    'refuses a %s booking',
    async (status) => {
      mockPrisma.booking.findFirst.mockResolvedValueOnce(
        makeRow({ status: PrismaBookingStatus[status], ...ASSIGNED }),
      );

      await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('can no longer be changed'),
      });
      expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses the nanny who is already on the booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(
      makeRow({ status: PrismaBookingStatus.APPROVED, ...ASSIGNED }),
    );

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 19 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'That nanny is already assigned to this booking.',
    });
    expect(mockPrisma.nannyProfile.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a nanny who is missing or not approved', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());
    mockPrisma.nannyProfile.findFirst.mockResolvedValueOnce(null);
    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 99 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only an approved nanny can be assigned.',
    });

    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow());
    mockPrisma.nannyProfile.findFirst.mockResolvedValueOnce(
      makeNanny({ approvalStatus: 'PENDING_REVIEW' }),
    );
    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Only an approved nanny can be assigned.',
    });
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a nanny with an overlapping booking', async () => {
    // assertNoConflict logs the clash it found, so the row needs real Dates.
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeRow()).mockResolvedValueOnce({
      id: 8,
      motherId: 11,
      status: 'CONFIRMED',
      startTime: new Date('2026-08-01T11:00:00.000Z'),
      endTime: new Date('2026-08-01T15:00:00.000Z'),
    });
    mockPrisma.nannyProfile.findFirst.mockResolvedValue(makeNanny());

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toBeInstanceOf(
      AppError,
    );
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('returns 409 when the booking changed under the admin', async () => {
    arrange(makeRow());
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
