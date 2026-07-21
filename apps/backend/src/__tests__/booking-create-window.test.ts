import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    nannyProfile: { findMany: jest.fn() },
    booking: { findFirst: jest.fn(), create: jest.fn() },
    // createBooking checks the mother's prepaid package-hours balance; no packages here.
    packagePurchase: { findMany: jest.fn().mockResolvedValue([]) },
    skill: { findMany: jest.fn() },
    durationMultiplierRule: { findMany: jest.fn() },
  },
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(6),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { createBooking } from '@backend/services/booking.service';

/**
 * Scheduling rules on createBooking: the daily booking window, the minimum
 * advance notice, and the configured min/max duration.
 *
 * Times are wall-clock in Africa/Cairo. "Now" is pinned to 2026-07-20 10:00
 * Cairo (= 07:00Z, since July is +03:00) so lead-time assertions are exact.
 */

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findMany: jest.Mock };
  booking: { findFirst: jest.Mock; create: jest.Mock };
  packagePurchase: { findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};
const mockConfig = getPlatformConfig as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;
const NOW_UTC = new Date('2026-07-20T07:00:00.000Z'); // 10:00 Cairo

const BASE_CONFIG = {
  serviceFeePercent: 6,
  standardHourlyRate: 100,
  nannyPercent: 80,
  platformPercent: 20,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  bookingWindowStartHour: 8,
  bookingWindowEndHour: 22,
};

const config = (overrides: Partial<typeof BASE_CONFIG> = {}) => ({ ...BASE_CONFIG, ...overrides });

function bookingRow(start: Date, end: Date) {
  return {
    id: 4,
    motherId: 10,
    mother: { firstName: 'Jane', lastName: 'Mom', avatarUrl: null },
    nannyProfileId: null,
    nannyProfile: null,
    status: 'PENDING',
    nannyDecision: 'PENDING',
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: new Date(`${start.toISOString().slice(0, 10)}T00:00:00.000Z`),
    startTime: start,
    endTime: end,
    durationHours: 4,
    baseRate: 100,
    effectiveHourlyRate: 100,
    selectedSkillFees: null,
    subtotal: 400,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 400,
    nannyAmount: 320,
    platformAmount: 80,
    rewardCreditHoursApplied: 0,
    rewardCreditPoints: 0,
    rewardCreditAmount: 0,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    startPinHash: null,
    startPinExpiresAt: null,
    payment: null,
    review: null,
    createdAt: NOW_UTC,
  };
}

/** Runs createBooking against the mocks and hands back the row Prisma was told to write. */
async function create(body: { startTime: string; endTime: string }) {
  mockPrisma.booking.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(bookingRow(data['startTime'] as Date, data['endTime'] as Date)),
  );
  const response = await createBooking(DECODED, { ...body, skillIds: [] });
  return { response, data: mockPrisma.booking.create.mock.calls[0][0].data };
}

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW_UTC);
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({
    id: 10,
    role: Role.MOTHER,
    deletedAt: null,
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockConfig.mockResolvedValue(config());
});

describe('createBooking — same-day booking', () => {
  it('accepts a booking later today', async () => {
    // The whole point of the change: this used to be rejected outright as
    // "at least one day in advance", regardless of how far ahead it was.
    const { response } = await create({
      startTime: '2026-07-20T14:00:00',
      endTime: '2026-07-20T18:00:00',
    });
    expect(response.status).toBe('PENDING');
  });
});

describe('createBooking — minimum advance notice', () => {
  it('rejects a start inside the lead time', async () => {
    // Now is 10:00 with a 2h minimum; 11:00 is too soon.
    await expect(
      create({ startTime: '2026-07-20T11:00:00', endTime: '2026-07-20T15:00:00' }),
    ).rejects.toThrow('Bookings must be made at least 2 hours in advance.');
  });

  it('accepts a start exactly on the lead-time boundary', async () => {
    const { response } = await create({
      startTime: '2026-07-20T12:00:00',
      endTime: '2026-07-20T16:00:00',
    });
    expect(response.status).toBe('PENDING');
  });

  it('rejects a booking in the past', async () => {
    await expect(
      create({ startTime: '2026-07-20T08:00:00', endTime: '2026-07-20T12:00:00' }),
    ).rejects.toThrow(AppError);
  });

  it('with no lead time configured, still rejects the past but allows the imminent', async () => {
    mockConfig.mockResolvedValue(config({ minAdvanceBookingHours: 0, minBookingHours: 1 }));

    await expect(
      create({ startTime: '2026-07-20T09:59:00', endTime: '2026-07-20T12:00:00' }),
    ).rejects.toThrow('Cannot book in the past.');

    const { response } = await create({
      startTime: '2026-07-20T10:01:00',
      endTime: '2026-07-20T12:00:00',
    });
    expect(response.status).toBe('PENDING');
  });
});

describe('createBooking — daily window', () => {
  it('rejects a start before the window opens', async () => {
    mockConfig.mockResolvedValue(config({ bookingWindowStartHour: 8, bookingWindowEndHour: 2 }));
    await expect(
      create({ startTime: '2026-07-21T03:00:00', endTime: '2026-07-21T07:00:00' }),
    ).rejects.toThrow('Bookings must run between 8am and 2am.');
  });

  it('rejects an end past the window close', async () => {
    await expect(
      create({ startTime: '2026-07-20T20:00:00', endTime: '2026-07-20T23:00:00' }),
    ).rejects.toThrow('Bookings must run between 8am and 10pm.');
  });

  it('accepts a booking that crosses midnight when the window does', async () => {
    mockConfig.mockResolvedValue(config({ bookingWindowStartHour: 8, bookingWindowEndHour: 2 }));
    const { data } = await create({
      startTime: '2026-07-20T22:00:00',
      endTime: '2026-07-21T02:00:00',
    });
    expect(data.startTime).toEqual(new Date('2026-07-20T19:00:00.000Z'));
    expect(data.endTime).toEqual(new Date('2026-07-20T23:00:00.000Z'));
  });

  it('reports the window, not the lead time, when a booking breaks both', async () => {
    // 03:00 today is both outside the window AND already in the past. Telling
    // the parent to book earlier would be useless advice.
    mockConfig.mockResolvedValue(config({ bookingWindowStartHour: 8, bookingWindowEndHour: 22 }));
    await expect(
      create({ startTime: '2026-07-20T03:00:00', endTime: '2026-07-20T07:00:00' }),
    ).rejects.toThrow('Bookings must run between 8am and 10pm.');
  });
});

describe('createBooking — duration limits come from config', () => {
  it('rejects a booking under the configured minimum', async () => {
    // Not the old hardcoded 1-hour floor.
    await expect(
      create({ startTime: '2026-07-20T14:00:00', endTime: '2026-07-20T15:00:00' }),
    ).rejects.toThrow('Minimum booking duration is 2 hours.');
  });

  it('rejects a booking over the configured maximum', async () => {
    mockConfig.mockResolvedValue(
      config({ maxBookingHours: 6, bookingWindowStartHour: 0, bookingWindowEndHour: 0 }),
    );
    await expect(
      create({ startTime: '2026-07-20T12:00:00', endTime: '2026-07-20T20:00:00' }),
    ).rejects.toThrow('Maximum booking duration is 6 hours.');
  });

  it('honours a raised minimum that the old hardcoded rule would have allowed', async () => {
    mockConfig.mockResolvedValue(config({ minBookingHours: 5 }));
    await expect(
      create({ startTime: '2026-07-20T14:00:00', endTime: '2026-07-20T18:00:00' }),
    ).rejects.toThrow('Minimum booking duration is 5 hours.');
  });
});

describe('createBooking — ordering and input shape', () => {
  it('rejects an end before the start', async () => {
    await expect(
      create({ startTime: '2026-07-20T16:00:00', endTime: '2026-07-20T14:00:00' }),
    ).rejects.toThrow('startTime must be before endTime.');
  });

  it('rejects a zero-length booking', async () => {
    await expect(
      create({ startTime: '2026-07-20T16:00:00', endTime: '2026-07-20T16:00:00' }),
    ).rejects.toThrow('startTime must be before endTime.');
  });

  it('rejects an offset-bearing timestamp from an outdated client', async () => {
    await expect(
      create({ startTime: '2026-07-20T14:00:00Z', endTime: '2026-07-20T18:00:00Z' }),
    ).rejects.toThrow(/wall-clock/i);
  });
});

describe('createBooking — what gets stored', () => {
  it('converts wall-clock to the true UTC instant', async () => {
    const { data } = await create({
      startTime: '2026-07-20T14:00:00',
      endTime: '2026-07-20T18:00:00',
    });
    // July is +03:00 in Cairo.
    expect(data.startTime).toEqual(new Date('2026-07-20T11:00:00.000Z'));
    expect(data.endTime).toEqual(new Date('2026-07-20T15:00:00.000Z'));
  });

  it('applies the winter offset for a winter booking', async () => {
    mockConfig.mockResolvedValue(config({ minAdvanceBookingHours: 2 }));
    const { data } = await create({
      startTime: '2027-01-20T14:00:00',
      endTime: '2027-01-20T18:00:00',
    });
    // January is +02:00.
    expect(data.startTime).toEqual(new Date('2027-01-20T12:00:00.000Z'));
  });

  it('derives date from the start, never from the client', async () => {
    const { data } = await create({
      startTime: '2026-07-20T14:00:00',
      endTime: '2026-07-20T18:00:00',
    });
    expect(data.date).toEqual(new Date('2026-07-20T00:00:00.000Z'));
  });

  it('dates an after-midnight booking to the day it starts, not the care-day it was picked from', async () => {
    // Picked from the 20 Jul slot list, but it starts on the 21st — so `date` is
    // the 21st, keeping it in agreement with startTime.
    mockConfig.mockResolvedValue(config({ bookingWindowStartHour: 8, bookingWindowEndHour: 2 }));
    const { data } = await create({
      startTime: '2026-07-21T00:00:00',
      endTime: '2026-07-21T02:00:00',
    });
    expect(data.date).toEqual(new Date('2026-07-21T00:00:00.000Z'));
    expect(data.startTime).toEqual(new Date('2026-07-20T21:00:00.000Z'));
  });

  it('returns times as platform-offset ISO strings', async () => {
    const { response } = await create({
      startTime: '2026-07-20T14:00:00',
      endTime: '2026-07-20T18:00:00',
    });
    expect(response.startTime).toBe('2026-07-20T14:00:00+03:00');
    expect(response.endTime).toBe('2026-07-20T18:00:00+03:00');
  });
});

describe('createBooking — daylight saving', () => {
  it('rejects a wall-clock time that does not exist on the spring-forward night', async () => {
    // Cairo jumps 00:00 → 01:00 on 2026-04-24, so 00:30 never happens.
    jest.setSystemTime(new Date('2026-04-20T07:00:00.000Z'));
    mockConfig.mockResolvedValue(config({ bookingWindowStartHour: 8, bookingWindowEndHour: 4 }));

    await expect(
      create({ startTime: '2026-04-24T00:30:00', endTime: '2026-04-24T03:30:00' }),
    ).rejects.toThrow(/daylight saving/i);

    jest.setSystemTime(NOW_UTC);
  });

  it('bills real elapsed hours across a DST change, not wall-clock hours', async () => {
    // 23:00 → 03:00 spans the spring-forward gap: 4 wall-clock hours but only 3
    // real ones. The nanny works 3, so the booking is 3. Pinned deliberately.
    jest.setSystemTime(new Date('2026-04-20T07:00:00.000Z'));
    mockConfig.mockResolvedValue(
      config({ bookingWindowStartHour: 8, bookingWindowEndHour: 4, minBookingHours: 2 }),
    );

    const { data } = await create({
      startTime: '2026-04-23T23:00:00',
      endTime: '2026-04-24T03:00:00',
    });
    expect(data.durationHours).toBe(3);

    jest.setSystemTime(NOW_UTC);
  });
});
