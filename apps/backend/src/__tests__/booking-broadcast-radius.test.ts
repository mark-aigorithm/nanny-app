import { Role } from '@nanny-app/shared';
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
  // createBooking checks the mother's prepaid package-hours balance; no packages here.
  const packagePurchase = { findMany: jest.fn().mockResolvedValue([]) };
  const durationMultiplierRule = { findMany: jest.fn() };
  return {
    prisma: {
      booking,
      user,
      nannyProfile,
      skill,
      durationMultiplierRule,
      packagePurchase,
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
  getRevealPhoneMinutes: jest.fn().mockResolvedValue(45),
  // Wide-open window: this suite is about the broadcast radius, not scheduling rules.
  getPlatformConfig: jest.fn().mockResolvedValue({
    serviceFeePercent: 6,
    standardHourlyRate: 100,
    nannyPercent: 80,
    platformPercent: 20,
    maxBookingHours: 12,
    minBookingHours: 1,
    minAdvanceBookingHours: 0,
    cancellationWindowHours: 24,
    broadcastRadiusKm: 10,
    pendingWarningMinutes: 15,
    pendingCriticalMinutes: 30,
    bookingWindowStartHour: 0,
    bookingWindowEndHour: 0,
  }),
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
  id: 10,
  firebaseUid: 'fb-mother',
  role: Role.MOTHER,
  ...BOOKING_COORDS,
  deletedAt: null,
};

const mother = { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null };

function makeBooking(overrides: Record<string, unknown> = {}) {
  const startTime = new Date(Date.now() + 20 * 24 * 3_600_000);
  const endTime = new Date(startTime.getTime() + 3 * 3_600_000);
  return {
    id: 4,
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
    payments: [],
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
    { userId: 14, user: { ...NEAR } },
    { userId: 13, user: { ...FAR } },
    { userId: 15, user: { latitude: null, longitude: null } },
  ]);
  mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }]);

  // Wall-clock, no offset, and a far-future date so the lead-time check is happy.
  await createBooking({ uid: 'fb-mother' } as never, {
    startTime: '2099-01-01T10:00:00',
    endTime: '2099-01-01T13:00:00',
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
    expect(notified).toEqual([1, 14, 15]);
  });

  it('notifies everyone when the booking has no coordinates', async () => {
    const notified = await runBroadcast({
      bookingOverrides: { latitude: null, longitude: null },
    });
    expect(notified).toEqual([1, 13, 14, 15]);
  });

  it('notifies everyone when the radius is 0 (filtering disabled)', async () => {
    mockRadius.mockResolvedValue(0);
    const notified = await runBroadcast({});
    expect(notified).toEqual([1, 13, 14, 15]);
  });
});

describe('listAvailableBookings — radius filter', () => {
  const nannyUser = {
    id: 16,
    firebaseUid: 'fb-nanny',
    role: Role.NANNY,
    deletedAt: null,
  };

  function mockPool(nannyCoords: { latitude: number | null; longitude: number | null }) {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: 19,
      user: nannyCoords,
    });
    // First findMany call = the nanny's busy slots; second = the open pool.
    mockPrisma.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeBooking({ id: 17, ...BOOKING_COORDS }),
        makeBooking({ id: 9, ...FAR }),
        makeBooking({ id: 18, latitude: null, longitude: null }),
      ]);
  }

  it('shows only in-radius and coordinate-less requests to a located nanny', async () => {
    mockPool({ latitude: 30.05, longitude: 31.24 }); // near Cairo
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result.map((b) => b.id).sort()).toEqual([17, 18]);
  });

  it('shows the full pool to a nanny without coordinates', async () => {
    mockPool({ latitude: null, longitude: null });
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result).toHaveLength(3);
  });

  it('shows the full pool when the radius is 0', async () => {
    mockRadius.mockResolvedValue(0);
    mockPool({ latitude: 30.05, longitude: 31.24 });
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result).toHaveLength(3);
  });
});
