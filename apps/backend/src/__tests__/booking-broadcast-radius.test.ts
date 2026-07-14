import { Role, BookingStatus } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus, NannyBookingDecision } from '@prisma/client';

jest.mock('@backend/db/prisma', () => {
  const booking = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const user = { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
  const nannyProfile = { findUnique: jest.fn(), findMany: jest.fn() };
  const skill = { findMany: jest.fn() };
  const durationMultiplierRule = { findMany: jest.fn() };
  return {
    prisma: {
      booking,
      user,
      nannyProfile,
      skill,
      durationMultiplierRule,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ booking, user, nannyProfile })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
}));

import { prisma } from '@backend/db/prisma';
import { getBroadcastRadiusKm } from '@backend/services/app-settings.service';
import { createInAppNotification } from '@backend/services/notification.service';
import { createBooking, listAvailableBookings } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  booking: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;
const mockRadius = getBroadcastRadiusKm as jest.Mock;

// Cairo; NEAR is <1 km away, FAR (Alexandria) is ~180 km away.
const BOOKING_COORDS = { latitude: 30.0444, longitude: 31.2357 };
const NEAR = { latitude: 30.05, longitude: 31.24 };
const FAR = { latitude: 31.2001, longitude: 29.9187 };

const motherUser = {
  id: 'mother-1',
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  ...BOOKING_COORDS,
  deletedAt: null,
};

const mother = { id: 'mother-1', firstName: 'Jane', lastName: 'Mom', avatarUrl: null };

function makeBooking(overrides: Record<string, unknown> = {}) {
  const startTime = new Date(Date.now() + 20 * 24 * 3_600_000);
  const endTime = new Date(startTime.getTime() + 3 * 3_600_000);
  return {
    id: 'booking-1',
    motherId: mother.id,
    mother,
    nannyProfileId: null,
    nannyProfile: null,
    status: PrismaBookingStatus.PENDING,
    nannyDecision: NannyBookingDecision.PENDING,
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: startTime,
    startTime,
    endTime,
    durationHours: 3,
    baseRate: 100,
    subtotal: 300,
    discountAmount: 0,
    serviceFeePercent: 6,
    serviceFeeAmount: 0,
    totalAmount: 300,
    latitude: BOOKING_COORDS.latitude,
    longitude: BOOKING_COORDS.longitude,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    payment: null,
    review: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/** Runs createBooking with the standard fan-out mocks; returns notified BOOKING_REQUESTED userIds. */
async function runBroadcast(options: {
  motherOverrides?: Record<string, unknown>;
  bookingOverrides?: Record<string, unknown>;
}): Promise<string[]> {
  mockPrisma.user.findUnique.mockResolvedValue({ ...motherUser, ...options.motherOverrides });
  mockPrisma.booking.findFirst.mockResolvedValue(null); // no idempotent reuse
  mockPrisma.booking.create.mockResolvedValue(makeBooking(options.bookingOverrides));
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([
    { userId: 'nanny-near', user: { ...NEAR } },
    { userId: 'nanny-far', user: { ...FAR } },
    { userId: 'nanny-nocoords', user: { latitude: null, longitude: null } },
  ]);
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

  const start = new Date(Date.now() + 20 * 24 * 3_600_000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 3 * 3_600_000);

  await createBooking({ uid: 'fb-mother' } as never, {
    date: start.toISOString().slice(0, 10),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    skillIds: [],
  });

  return mockNotify.mock.calls
    .filter((c) => c[0].type === 'BOOKING_REQUESTED')
    .map((c) => c[0].userId as string)
    .sort();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRadius.mockResolvedValue(10);
});

describe('notifyBookingBroadcast — radius filter', () => {
  it('notifies only in-radius and coordinate-less nannies (plus admins)', async () => {
    const notified = await runBroadcast({});
    expect(notified).toEqual(['admin-1', 'nanny-near', 'nanny-nocoords']);
  });

  it('notifies everyone when the booking has no coordinates', async () => {
    const notified = await runBroadcast({
      bookingOverrides: { latitude: null, longitude: null },
    });
    expect(notified).toEqual(['admin-1', 'nanny-far', 'nanny-near', 'nanny-nocoords']);
  });

  it('notifies everyone when the radius is 0 (filtering disabled)', async () => {
    mockRadius.mockResolvedValue(0);
    const notified = await runBroadcast({});
    expect(notified).toEqual(['admin-1', 'nanny-far', 'nanny-near', 'nanny-nocoords']);
  });
});
