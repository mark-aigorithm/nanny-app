import { Role } from '@nanny-app/shared';
import { BookingStatus as PrismaBookingStatus, NannyBookingDecision } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => {
  const booking = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  };
  const user = { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() };
  const nannyProfile = { findUnique: jest.fn(), findMany: jest.fn() };
  const skill = { findMany: jest.fn() };
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
  // Radius 0 disables the distance filter — this suite is purely about skills.
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(0),
  getRevealPhoneMinutes: jest.fn().mockResolvedValue(45),
  getPlatformConfig: jest.fn().mockResolvedValue({
    serviceFeePercent: 6,
    standardHourlyRate: 100,
    nannyPercent: 80,
    platformPercent: 20,
    maxBookingHours: 12,
    minBookingHours: 1,
    minAdvanceBookingHours: 0,
    cancellationWindowHours: 24,
    broadcastRadiusKm: 0,
    pendingWarningMinutes: 15,
    pendingCriticalMinutes: 30,
    bookingWindowStartHour: 0,
    bookingWindowEndHour: 0,
  }),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  acceptBooking,
  createBooking,
  listAvailableBookings,
} from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  booking: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};

const mockNotify = createInAppNotification as jest.Mock;

// The add-on catalog. FRENCH carries a fee; SWIMMING is free but still a
// requirement — the mother asked for it either way.
const FRENCH = { id: 1, name: 'French speaker', feeType: 'FLAT', feeValue: 20 };
const SWIMMING = { id: 2, name: 'Swimming', feeType: null, feeValue: 0 };

const mother = { id: 10, firstName: 'Jane', lastName: 'Mom', avatarUrl: null };
const motherUser = { id: 10, firebaseUid: 'fb-mother', role: Role.MOTHER, deletedAt: null };

/** The skill-fee snapshot a booking stores for the given catalog entries. */
function snapshot(skills: { id: number; name: string }[]) {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    feeType: null,
    feeValue: 0,
    amountPerHour: 0,
  }));
}

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
    latitude: null,
    longitude: null,
    selectedSkillFees: null,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    payments: [],
    extensions: [],
    adjustments: [],
    review: null,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Runs createBooking asking for `skillIds`, against a pool of three nannies
 * with the given skill sets. Returns the notified nanny userIds.
 */
async function broadcastTo(
  skillIds: number[],
  pool: { userId: number; skillIds: number[] }[],
): Promise<number[]> {
  mockPrisma.user.findUnique.mockResolvedValue(motherUser);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.booking.create.mockResolvedValue(
    makeBooking({ selectedSkillFees: snapshot([FRENCH, SWIMMING].filter((s) => skillIds.includes(s.id))) }),
  );
  mockPrisma.skill.findMany.mockResolvedValue([FRENCH, SWIMMING]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue(
    pool.map((n) => ({
      userId: n.userId,
      user: { latitude: null, longitude: null },
      nannySkills: n.skillIds.map((id) => ({ skillId: id })),
    })),
  );
  mockPrisma.user.findMany.mockResolvedValue([]); // no admins, keeps the assertion clean

  await createBooking({ uid: 'fb-mother' } as never, {
    startTime: '2099-01-01T10:00:00',
    endTime: '2099-01-01T13:00:00',
    skillIds,
    children: [{ name: null, ageYears: 4 }],
  });

  return mockNotify.mock.calls
    .filter((c) => c[0].type === 'BOOKING_REQUESTED')
    .map((c) => c[0].userId as number)
    .sort((a, b) => a - b);
}

beforeEach(() => jest.clearAllMocks());

describe('notifyBookingBroadcast — skill filter', () => {
  const POOL = [
    { userId: 11, skillIds: [] },
    { userId: 12, skillIds: [FRENCH.id] },
    { userId: 13, skillIds: [FRENCH.id, SWIMMING.id] },
  ];

  it('notifies every nanny when the booking asks for no skills', async () => {
    expect(await broadcastTo([], POOL)).toEqual([11, 12, 13]);
  });

  it('notifies only nannies holding the requested skill', async () => {
    expect(await broadcastTo([FRENCH.id], POOL)).toEqual([12, 13]);
  });

  it('requires every requested skill, not just one of them', async () => {
    expect(await broadcastTo([FRENCH.id, SWIMMING.id], POOL)).toEqual([13]);
  });

  it('counts a fee-less skill as a requirement too', async () => {
    expect(await broadcastTo([SWIMMING.id], POOL)).toEqual([13]);
  });

  it('notifies nobody when no nanny holds the requested skills', async () => {
    expect(await broadcastTo([FRENCH.id, SWIMMING.id], [{ userId: 11, skillIds: [] }])).toEqual([]);
  });
});

describe('listAvailableBookings — skill filter', () => {
  const nannyUser = { id: 16, firebaseUid: 'fb-nanny', role: Role.NANNY, deletedAt: null };

  function mockPool(nannySkillIds: number[]) {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: 19,
      user: { latitude: null, longitude: null },
      nannySkills: nannySkillIds.map((id) => ({ skillId: id })),
    });
    // First findMany = the nanny's busy slots; second = the open pool.
    mockPrisma.booking.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      makeBooking({ id: 17, selectedSkillFees: null }),
      makeBooking({ id: 18, selectedSkillFees: snapshot([FRENCH]) }),
      makeBooking({ id: 19, selectedSkillFees: snapshot([FRENCH, SWIMMING]) }),
    ]);
  }

  it('hides requests demanding a skill the nanny does not have', async () => {
    mockPool([]);
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result.map((b) => b.id)).toEqual([17]);
  });

  it('shows a request once the nanny holds every skill it asks for', async () => {
    mockPool([FRENCH.id]);
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result.map((b) => b.id).sort((a, b) => a - b)).toEqual([17, 18]);
  });

  it('shows the whole pool to a fully-skilled nanny', async () => {
    mockPool([FRENCH.id, SWIMMING.id]);
    const result = await listAvailableBookings({ uid: 'fb-nanny' } as never);
    expect(result).toHaveLength(3);
  });
});

describe('acceptBooking — skill gate', () => {
  const nannyUser = { id: 16, firebaseUid: 'fb-nanny', role: Role.NANNY, deletedAt: null };

  function mockClaim(nannySkillIds: number[], bookingSkills: { id: number; name: string }[]) {
    mockPrisma.user.findUnique.mockResolvedValue(nannyUser);
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: 19,
      userId: nannyUser.id,
      nannySkills: nannySkillIds.map((id) => ({ skillId: id })),
    });
    const booking = makeBooking({ selectedSkillFees: snapshot(bookingSkills) });
    mockPrisma.booking.findUnique.mockResolvedValue(booking);
    mockPrisma.booking.findMany.mockResolvedValue([]); // no conflicting slots
    mockPrisma.booking.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.booking.findUniqueOrThrow.mockResolvedValue({
      ...booking,
      nannyProfileId: 19,
      status: PrismaBookingStatus.APPROVED,
    });
  }

  // A stale requests list, or a direct API call, must not let an unqualified
  // nanny claim work the mother paid a skill surcharge for.
  it('refuses a claim from a nanny missing a required skill', async () => {
    mockClaim([], [FRENCH]);

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 4)).rejects.toThrow(AppError);
    expect(mockPrisma.booking.updateMany).not.toHaveBeenCalled();
  });

  it('allows a claim from a nanny holding every required skill', async () => {
    mockClaim([FRENCH.id, SWIMMING.id], [FRENCH, SWIMMING]);

    await expect(acceptBooking({ uid: 'fb-nanny' } as never, 4)).resolves.toBeDefined();
    expect(mockPrisma.booking.updateMany).toHaveBeenCalled();
  });
});
