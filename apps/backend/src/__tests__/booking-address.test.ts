import { Role } from '@nanny-app/shared';
import { Prisma } from '@prisma/client';

/**
 * Where a booking happens: createBooking books at one of the mother's saved
 * addresses and snapshots it; every read then shows the mother the whole
 * address but the nanny only the area until the booking is CONFIRMED.
 */

jest.mock('@backend/db/prisma', () => {
  const booking = { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() };
  const address = { findFirst: jest.fn() };
  return {
    prisma: {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      nannyProfile: { findMany: jest.fn(), findUnique: jest.fn() },
      booking,
      address,
      child: { updateMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
      packagePurchase: { findMany: jest.fn().mockResolvedValue([]) },
      skill: { findMany: jest.fn() },
      durationMultiplierRule: { findMany: jest.fn() },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ booking, address })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn().mockResolvedValue(0),
  getStandardHourlyRate: jest.fn().mockResolvedValue(100),
  getRevenueSplit: jest.fn().mockResolvedValue({ nannyPercent: 80, platformPercent: 20 }),
  getBroadcastRadiusKm: jest.fn().mockResolvedValue(10),
  getSkillMatchingEnabled: jest.fn().mockResolvedValue(true),
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { createBooking, getBooking, listAvailableBookings } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findMany: jest.Mock; findUnique: jest.Mock };
  booking: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  address: { findFirst: jest.Mock };
  child: { findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
};
const mockConfig = getPlatformConfig as jest.Mock;

const MOTHER = { uid: 'fb-mother' } as never;
const NANNY = { uid: 'fb-nanny' } as never;
const NOW_UTC = new Date('2026-07-20T07:00:00.000Z'); // 10:00 Cairo

const CONFIG = {
  serviceFeePercent: 0,
  standardHourlyRate: 100,
  nannyPercent: 80,
  platformPercent: 20,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  bookingWindowStartHour: 8,
  bookingWindowEndHour: 22,
  includedChildrenPerBooking: 2,
  maxChildrenPerBooking: 4,
  extraChildFeeType: 'FLAT' as const,
  extraChildFeeValue: 30,
};

const BODY = {
  startTime: '2026-07-20T14:00:00',
  endTime: '2026-07-20T18:00:00',
  skillIds: [] as number[],
  children: [{ name: null, ageYears: 3, allergies: null }],
  addressId: 7,
};

function addressRow() {
  return {
    id: 7,
    userId: 10,
    label: 'Work',
    formattedAddress: 'Smart Village, Giza Governorate, Egypt',
    governorate: 'Giza',
    area: 'Sheikh Zayed',
    street: null,
    building: 'B7',
    floor: '3',
    apartment: null,
    landmark: 'Behind the fountain',
    latitude: new Prisma.Decimal('30.0716'),
    longitude: new Prisma.Decimal('31.0165'),
    isDefault: false,
    createdAt: NOW_UTC,
  };
}

const SNAPSHOT = {
  addressId: 7,
  label: 'Work',
  formattedAddress: 'Smart Village, Giza Governorate, Egypt',
  governorate: 'Giza',
  area: 'Sheikh Zayed',
  street: null,
  building: 'B7',
  floor: '3',
  apartment: null,
  landmark: 'Behind the fountain',
  latitude: 30.0716,
  longitude: 31.0165,
};

function bookingRow(overrides: Record<string, unknown> = {}) {
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
    date: new Date('2026-07-20T00:00:00.000Z'),
    startTime: new Date('2026-07-20T11:00:00.000Z'),
    endTime: new Date('2026-07-20T15:00:00.000Z'),
    durationHours: 4,
    baseRate: 100,
    effectiveHourlyRate: 100,
    childrenCount: 1,
    extraChildren: 0,
    extraChildFeePerHour: 0,
    bookedChildren: [{ name: null, ageYears: 3, allergies: null }],
    selectedSkillFees: null,
    addressId: 7,
    bookedAddress: SNAPSHOT,
    latitude: new Prisma.Decimal('30.0716'),
    longitude: new Prisma.Decimal('31.0165'),
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
    packageHoursApplied: 0,
    packageSkillsCovered: 0,
    packageCreditAmount: 0,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    motherEndedAt: null,
    startPinHash: null,
    startPinExpiresAt: null,
    payments: [],
    extensions: [],
    adjustments: [],
    review: null,
    createdAt: NOW_UTC,
    ...overrides,
  };
}

const withNanny = (status: string) =>
  bookingRow({
    status,
    nannyProfileId: 3,
    nannyProfile: {
      id: 3,
      userId: 20,
      user: { firstName: 'Amira', lastName: 'H', avatarUrl: null, phone: null, addresses: [] },
    },
  });

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(NOW_UTC);
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockImplementation(({ where }: { where: { firebaseUid: string } }) =>
    Promise.resolve(
      where.firebaseUid === 'fb-nanny'
        ? { id: 20, role: Role.NANNY, deletedAt: null }
        : { id: 10, role: Role.MOTHER, deletedAt: null, idVerificationStatus: 'APPROVED', isEmailVerified: true },
    ),
  );
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.booking.create.mockResolvedValue(bookingRow());
  mockPrisma.address.findFirst.mockResolvedValue(addressRow());
  mockPrisma.child.findMany.mockResolvedValue([]);
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockConfig.mockResolvedValue(CONFIG);
});

describe('createBooking — the chosen address', () => {
  it('looks the address up as the mother’s own live row', async () => {
    await createBooking(MOTHER, BODY);

    expect(mockPrisma.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, userId: 10, deletedAt: null } }),
    );
  });

  it('404s an address that is not hers, before pricing or inserting anything', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);

    await expect(createBooking(MOTHER, BODY)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('writes the FK, the snapshot and the broadcast coordinates from the address', async () => {
    await createBooking(MOTHER, BODY);

    const data = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ addressId: 7, bookedAddress: SNAPSHOT });
    // The broadcast columns take the address row's Decimals as they are.
    expect(Number(data.latitude)).toBe(30.0716);
    expect(Number(data.longitude)).toBe(31.0165);
  });

  it('treats the address as part of the request’s identity when reusing a pending request', async () => {
    await createBooking(MOTHER, BODY);

    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ addressId: 7 }) }),
    );
  });

  it('answers the mother with the full address', async () => {
    const res = await createBooking(MOTHER, BODY);

    expect(res.address).toEqual({ area: 'Sheikh Zayed, Giza', details: SNAPSHOT });
  });
});

describe('the address on a booking read', () => {
  it('the mother always sees the whole address', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(withNanny('PENDING'));

    const res = await getBooking(MOTHER, 4);

    expect(res.address?.details).toEqual(SNAPSHOT);
  });

  it.each(['APPROVED', 'PENDING_CONFIRMATION'])(
    'the nanny holding a %s booking sees the area only',
    async (status) => {
      mockPrisma.booking.findUnique.mockResolvedValue(withNanny(status));

      const res = await getBooking(NANNY, 4);

      expect(res.address).toEqual({ area: 'Sheikh Zayed, Giza', details: null });
    },
  );

  it.each(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])(
    'the nanny sees the whole address once the booking is %s',
    async (status) => {
      mockPrisma.booking.findUnique.mockResolvedValue(withNanny(status));

      const res = await getBooking(NANNY, 4);

      expect(res.address?.details).toEqual(SNAPSHOT);
    },
  );

  it('the open-requests pool carries the area and nothing more', async () => {
    mockPrisma.nannyProfile.findUnique.mockResolvedValue({
      id: 3,
      user: { addresses: [{ latitude: new Prisma.Decimal('30.07'), longitude: new Prisma.Decimal('31.01') }] },
      nannySkills: [],
    });
    mockPrisma.booking.findMany
      .mockResolvedValueOnce([]) // her busy slots
      .mockResolvedValueOnce([bookingRow()]); // the open pool

    const [offered] = await listAvailableBookings(NANNY);

    expect(offered?.address).toEqual({ area: 'Sheikh Zayed, Giza', details: null });
  });

  it('is null on a booking made before addresses existed', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(
      bookingRow({ addressId: null, bookedAddress: null, latitude: null, longitude: null }),
    );

    expect((await getBooking(MOTHER, 4)).address).toBeNull();
  });

  it('degrades a malformed snapshot to "no address" rather than failing the read', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(bookingRow({ bookedAddress: { junk: true } }));

    expect((await getBooking(MOTHER, 4)).address).toBeNull();
  });
});
