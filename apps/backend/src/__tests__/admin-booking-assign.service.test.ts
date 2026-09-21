import { BookingStatus as PrismaBookingStatus } from '@prisma/client';

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

    await expect(assignBookingNanny(4, ADMIN_UID, { nannyProfileId: 21 })).rejects.toMatchObject({
      statusCode: 409,
    });
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

describe('listBookingCandidates', () => {
  /**
   * A booking as the candidates query selects it. Coordinates are plain
   * numbers, not `dec()`: `toLatLng` runs `Number()` on them, which a real
   * Prisma.Decimal supports via valueOf but the `dec` stub does not.
   */
  function bookingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 4,
      nannyProfileId: null,
      startTime: new Date('2026-08-01T10:00:00.000Z'),
      endTime: new Date('2026-08-01T13:00:00.000Z'),
      latitude: 30.0444,
      longitude: 31.2357,
      selectedSkillFees: [
        { id: 1, name: 'CPR', feeType: 'FLAT', feeValue: 10, amountPerHour: 10 },
        { id: 2, name: 'French', feeType: null, feeValue: 0, amountPerHour: 0 },
      ],
      ...overrides,
    };
  }

  /** A nanny profile as the candidates query selects it. */
  function profile(
    id: number,
    first: string,
    skillIds: number[],
    home: { latitude: number; longitude: number } | null = { latitude: 30.0444, longitude: 31.2357 },
  ) {
    return {
      id,
      rating: dec(4.5),
      reviewCount: 3,
      user: {
        firstName: first,
        lastName: 'Nanny',
        phone: null,
        addresses: home ? [{ formattedAddress: 'x', latitude: home.latitude, longitude: home.longitude }] : [],
      },
      nannySkills: skillIds.map((skillId) => ({ skillId })),
    };
  }

  it('404s on an unknown booking', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(null);
    await expect(listBookingCandidates(4, { limit: 20 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('excludes the current nanny and filters to approved, live profiles by name', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow({ nannyProfileId: 19 }));
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([]);
    // No candidates come back, so listBookingCandidates never queries for clashes.
    // `booking.findMany` is deliberately left unmocked here (see the assertion
    // below) rather than queued with an unconsumed mockResolvedValueOnce, which
    // would leak into the next test's queue: jest.clearAllMocks() in beforeEach
    // clears call history but not queued once-implementations.

    await listBookingCandidates(4, { q: 'sar', limit: 5 });

    const call = mockPrisma.nannyProfile.findMany.mock.calls[0][0];
    expect(call.where).toEqual({
      deletedAt: null,
      id: { not: 19 },
      user: {
        deletedAt: null,
        approvalStatus: 'APPROVED',
        OR: [
          { firstName: { contains: 'sar', mode: 'insensitive' } },
          { lastName: { contains: 'sar', mode: 'insensitive' } },
        ],
      },
    });
    expect(call.take).toBe(5);
    // Nobody to check for clashes, so no second query.
    expect(mockPrisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('flags a clash, missing skills and distance per nanny', async () => {
    mockRadius.mockResolvedValue(5);
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow());
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([
      profile(21, 'Busy', [1, 2]),
      profile(22, 'Far', [1], { latitude: 30.2, longitude: 31.2357 }), // ~17 km north
      profile(23, 'Nowhere', [1, 2], null),
    ]);
    mockPrisma.booking.findMany.mockResolvedValueOnce([{ nannyProfileId: 21 }]);

    const rows = await listBookingCandidates(4, { limit: 20 });

    // The clash query is scoped to these nannies, this window, live bookings only.
    const clash = mockPrisma.booking.findMany.mock.calls[0][0];
    expect(clash.where).toMatchObject({
      nannyProfileId: { in: [21, 22, 23] },
      id: { not: 4 },
      deletedAt: null,
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
      startTime: { lt: new Date('2026-08-01T13:00:00.000Z') },
      endTime: { gt: new Date('2026-08-01T10:00:00.000Z') },
    });

    expect(rows).toEqual([
      {
        id: 21, name: 'Busy Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: true, missingSkills: [], distanceKm: 0, outsideRadius: false,
      },
      {
        id: 22, name: 'Far Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: false, missingSkills: ['French'], distanceKm: 17.3, outsideRadius: true,
      },
      {
        id: 23, name: 'Nowhere Nanny', phone: null, rating: 4.5, reviewCount: 3,
        conflict: false, missingSkills: [], distanceKm: null, outsideRadius: false,
      },
    ]);
  });

  it('reports no missing skills when matching is switched off, and no radius verdict at radius 0', async () => {
    mockSkillMatching.mockResolvedValue(false);
    mockRadius.mockResolvedValue(0);
    mockPrisma.booking.findFirst.mockResolvedValueOnce(bookingRow());
    mockPrisma.nannyProfile.findMany.mockResolvedValueOnce([
      profile(22, 'Far', [], { latitude: 30.2, longitude: 31.2357 }),
    ]);
    mockPrisma.booking.findMany.mockResolvedValueOnce([]);

    const [row] = await listBookingCandidates(4, { limit: 20 });

    expect(row?.missingSkills).toEqual([]);
    expect(row?.distanceKm).toBe(17.3);
    expect(row?.outsideRadius).toBe(false);
  });
});
