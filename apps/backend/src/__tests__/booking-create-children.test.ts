import { Role } from '@nanny-app/shared';

/**
 * createBooking's handling of the children on a request: the configured ceiling,
 * the snapshot written to the row, and the "save for next booking" side effect.
 *
 * The price math itself is covered by extra-child-fee.test.ts — what this suite
 * pins is the wiring, which is where the count can silently stop reaching the
 * pricing engine.
 */

jest.mock('@backend/db/prisma', () => {
  const booking = { findFirst: jest.fn(), create: jest.fn() };
  const child = { updateMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() };
  return {
    prisma: {
      user: { findUnique: jest.fn(), findMany: jest.fn() },
      nannyProfile: { findMany: jest.fn() },
      booking,
      child,
      packagePurchase: { findMany: jest.fn().mockResolvedValue([]) },
      skill: { findMany: jest.fn() },
      durationMultiplierRule: { findMany: jest.fn() },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ booking, child })
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
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import { createBooking } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findMany: jest.Mock };
  booking: { findFirst: jest.Mock; create: jest.Mock };
  child: { updateMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
  packagePurchase: { findMany: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockConfig = getPlatformConfig as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;
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

/** A 4-hour booking, well inside the window and the lead time. */
const WINDOW = {
  startTime: '2026-07-20T14:00:00',
  endTime: '2026-07-20T18:00:00',
  skillIds: [] as number[],
};

const kid = (ageYears: number, name: string | null = null) => ({ name, ageYears });

function bookingRow() {
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
    effectiveHourlyRate: 130,
    childrenCount: 3,
    extraChildren: 1,
    extraChildFeePerHour: 30,
    bookedChildren: [kid(2), kid(4), kid(7)],
    selectedSkillFees: null,
    subtotal: 520,
    durationMultiplier: 1,
    discountAmount: 0,
    serviceFeePercent: 0,
    serviceFeeAmount: 0,
    totalAmount: 520,
    nannyAmount: 416,
    platformAmount: 104,
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
    startPinHash: null,
    startPinExpiresAt: null,
    payments: [],
    extensions: [],
    review: null,
    createdAt: NOW_UTC,
  };
}

/** The `data` createBooking asked Prisma to insert. */
const createdData = () => mockPrisma.booking.create.mock.calls[0]?.[0]?.data;

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
    idVerificationStatus: 'APPROVED',
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.booking.create.mockResolvedValue(bookingRow());
  mockPrisma.child.findMany.mockResolvedValue([]);
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockConfig.mockResolvedValue(CONFIG);
});

describe('createBooking — children ceiling', () => {
  it('rejects more children than one nanny is allowed to take', async () => {
    await expect(
      createBooking(DECODED, { ...WINDOW, children: [kid(1), kid(3), kid(5), kid(7), kid(9)] }),
    ).rejects.toThrow('One nanny can care for at most 4 children in a single booking.');
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('accepts exactly the maximum', async () => {
    await createBooking(DECODED, { ...WINDOW, children: [kid(1), kid(3), kid(5), kid(7)] });
    expect(mockPrisma.booking.create).toHaveBeenCalled();
  });
});

describe('createBooking — pricing and snapshot', () => {
  it('prices the extra children and snapshots who the booking is for', async () => {
    await createBooking(DECODED, {
      ...WINDOW,
      children: [kid(2, 'Lina'), kid(4, 'Omar'), kid(7)],
    });

    const data = createdData();
    // 3 children, 2 included → 1 extra × EGP 30 → 130/hour × 4h.
    expect(data.childrenCount).toBe(3);
    expect(data.extraChildren).toBe(1);
    expect(data.extraChildFeePerHour).toBe(30);
    expect(data.effectiveHourlyRate).toBe(130);
    expect(data.subtotal).toBe(520);
    // The nanny is minding more children, so she earns more for it.
    expect(data.nannyAmount).toBe(416);
    expect(data.bookedChildren).toEqual([kid(2, 'Lina'), kid(4, 'Omar'), kid(7)]);
  });

  it('charges nothing extra at or below the included allowance', async () => {
    await createBooking(DECODED, { ...WINDOW, children: [kid(3), kid(6)] });
    const data = createdData();
    expect(data.extraChildren).toBe(0);
    expect(data.extraChildFeePerHour).toBe(0);
    expect(data.effectiveHourlyRate).toBe(100);
  });
});

describe('createBooking — saving children for next time', () => {
  it('replaces the saved set when asked', async () => {
    await createBooking(DECODED, {
      ...WINDOW,
      children: [kid(2, 'Lina'), kid(5, 'Omar')],
      saveChildren: true,
    });

    // Replace-all: the old set is soft-deleted, then the new one inserted.
    expect(mockPrisma.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 10, deletedAt: null } }),
    );
    expect(mockPrisma.child.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 10, name: 'Lina', ageYears: 2 },
        { userId: 10, name: 'Omar', ageYears: 5 },
      ],
    });
  });

  it('leaves the saved set alone by default', async () => {
    await createBooking(DECODED, { ...WINDOW, children: [kid(2)] });
    expect(mockPrisma.child.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.child.createMany).not.toHaveBeenCalled();
  });

  it('writes the booking and the children in one transaction', async () => {
    // A failed booking must never silently rewrite her saved family.
    await createBooking(DECODED, { ...WINDOW, children: [kid(2)], saveChildren: true });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

describe('createBooking — idempotency', () => {
  it('reuses a pending request only when the child count also matches', async () => {
    await createBooking(DECODED, { ...WINDOW, children: [kid(2), kid(4), kid(7)] });
    // The count is part of the request's identity: it changes the price, so a
    // resubmission with different children must not hand back the old booking.
    expect(mockPrisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ childrenCount: 3 }),
      }),
    );
  });
});
