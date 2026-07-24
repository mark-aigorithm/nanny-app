import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    nannyProfile: { findUnique: jest.fn(), findMany: jest.fn() },
    booking: { findFirst: jest.fn(), create: jest.fn() },
    // createBooking checks the mother's prepaid package-hours balance; no packages here.
    packagePurchase: { findMany: jest.fn().mockResolvedValue([]) },
    promoCode: { findFirst: jest.fn(), update: jest.fn() },
    promoCodeRedemption: { count: jest.fn(), create: jest.fn() },
    skill: { findMany: jest.fn() },
    durationMultiplierRule: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn(),
  getStandardHourlyRate: jest.fn(),
  getRevenueSplit: jest.fn(),
  getBroadcastRadiusKm: jest.fn(),
  getPlatformConfig: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import {
  getBroadcastRadiusKm,
  getPlatformConfig,
  getRevenueSplit,
  getServiceFeePercent,
  getStandardHourlyRate,
} from '@backend/services/app-settings.service';
import { createBooking, validateBookingPromo } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock; findMany: jest.Mock };
  booking: { findFirst: jest.Mock; create: jest.Mock };
  packagePurchase: { findMany: jest.Mock };
  promoCode: { findFirst: jest.Mock; update: jest.Mock };
  promoCodeRedemption: { count: jest.Mock; create: jest.Mock };
  skill: { findMany: jest.Mock };
  durationMultiplierRule: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockFee = getServiceFeePercent as jest.Mock;
const mockRate = getStandardHourlyRate as jest.Mock;
const mockSplit = getRevenueSplit as jest.Mock;
const mockRadius = getBroadcastRadiusKm as jest.Mock;
const mockConfig = getPlatformConfig as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;

/** Wide-open window so these promo tests only exercise pricing, not scheduling. */
const PLATFORM_CONFIG = {
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
};

// Wall-clock, no offset, and a far-future date so the lead-time check is happy.
// The request is nanny-less — the fixed platform rate prices it.
const baseBody = {
  startTime: '2099-01-01T10:00:00',
  endTime: '2099-01-01T12:00:00',
  // One child, so the extra-child fee contributes nothing and these promo
  // assertions keep testing only the promo.
  children: [{ name: null, ageYears: 4 }],
};

function makeBookingRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2099-01-01T10:00:00.000Z');
  return {
    id: 4,
    motherId: 10,
    mother: { firstName: 'Jane', lastName: 'Mom', avatarUrl: null },
    nannyProfileId: 19,
    nannyProfile: {
      id: 19,
      user: { id: 16, firstName: 'Elena', lastName: 'Nanny', avatarUrl: null, address: null },
    },
    status: 'PENDING',
    nannyDecision: 'PENDING',
    nannyDecidedAt: null,
    adminApprovedAt: null,
    type: 'STANDARD',
    date: start,
    startTime: start,
    endTime: new Date('2099-01-01T12:00:00.000Z'),
    durationHours: 2,
    baseRate: 100,
    subtotal: 200,
    discountAmount: 0,
    serviceFeePercent: 6,
    serviceFeeAmount: 12,
    totalAmount: 212,
    specialInstructions: null,
    cancellationReason: null,
    cancelledAt: null,
    nannyCheckedInAt: null,
    nannyCheckedOutAt: null,
    payments: [],
    // Matches bookingInclude: the relation is always present, empty by default.
    extensions: [],
    review: null,
    createdAt: start,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ id: 10, role: Role.MOTHER, deletedAt: null });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.promoCodeRedemption.count.mockResolvedValue(0);
  mockPrisma.skill.findMany.mockResolvedValue([]);
  mockPrisma.durationMultiplierRule.findMany.mockResolvedValue([]);
  mockFee.mockResolvedValue(6);
  mockRate.mockResolvedValue(100);
  mockSplit.mockResolvedValue({ nannyPercent: 80, platformPercent: 20 });
  mockRadius.mockResolvedValue(10);
  mockConfig.mockResolvedValue(PLATFORM_CONFIG);
});

describe('createBooking (promo wiring)', () => {
  it('creates a booking with no discount when no promo code is provided', async () => {
    mockPrisma.booking.create.mockResolvedValue(makeBookingRow());

    const res = await createBooking(DECODED, baseBody as never);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    const data = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(data.discountAmount).toBe(0);
    expect(data.promoCodeId).toBeUndefined();
    expect(data.subtotal).toBe(200);
    expect(data.totalAmount).toBe(200); // no service fee under the split model
    expect(data.nannyAmount).toBe(160); // 80% of 200
    expect(data.platformAmount).toBe(40);
    expect(res.discountAmount).toBe(0);
    expect(mockPrisma.promoCodeRedemption.create).not.toHaveBeenCalled();
  });

  it('reserves a valid promo code on the booking without consuming it', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue({
      id: 23,
      code: 'SAVE50',
      discountType: 'FLAT',
      value: 50,
      maxUsage: null,
      maxUsagePerUser: null,
      usageCount: 0,
      isActive: true,
      expiresAt: null,
      deletedAt: null,
    });
    mockPrisma.booking.create.mockResolvedValue(
      makeBookingRow({ promoCodeId: 23, discountAmount: 50, totalAmount: 162 }),
    );

    const res = await createBooking(DECODED, { ...baseBody, promoCode: 'SAVE50' } as never);

    const data = mockPrisma.booking.create.mock.calls[0][0].data;
    expect(data.promoCodeId).toBe(23);
    expect(data.discountAmount).toBe(50);
    expect(data.subtotal).toBe(200); // priced subtotal before discount
    expect(data.serviceFeeAmount).toBe(0); // legacy fee retired under the split
    expect(data.totalAmount).toBe(150); // 200 − 50
    expect(data.nannyAmount).toBe(120); // 80% of 150
    expect(res.discountAmount).toBe(50);

    // The code is only spent once the payment is captured — a request that no
    // nanny claims, or that the mother cancels, must leave it usable.
    expect(mockPrisma.promoCode.update).not.toHaveBeenCalled();
    expect(mockPrisma.promoCodeRedemption.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid promo code and writes nothing', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);

    await expect(
      createBooking(DECODED, { ...baseBody, promoCode: 'NOPE' } as never),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
  });

  it('reuses an existing PENDING booking on retry without consuming the code', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce(makeBookingRow()); // existingPending early-return

    const res = await createBooking(DECODED, { ...baseBody, promoCode: 'SAVE50' } as never);

    expect(res.id).toBe(4);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    expect(mockPrisma.promoCode.findFirst).not.toHaveBeenCalled();
  });
});

describe('validateBookingPromo', () => {
  it('computes the discount from the priced subtotal (no fee added) and returns it', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue({
      id: 23,
      code: 'SAVE10',
      discountType: 'PERCENTAGE',
      value: 10,
      maxUsage: null,
      maxUsagePerUser: null,
      usageCount: 0,
      isActive: true,
      expiresAt: null,
      deletedAt: null,
    });

    const res = await validateBookingPromo(DECODED, { code: 'SAVE10', subtotal: 200 });

    // No fee on top: 10% of the 200 subtotal = 20
    expect(res.discountAmount).toBeCloseTo(20);
    expect(mockPrisma.promoCodeRedemption.create).not.toHaveBeenCalled(); // preview never writes
  });

  it('forbids non-mothers (403)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 12, role: Role.NANNY, deletedAt: null });
    await expect(
      validateBookingPromo(DECODED, { code: 'SAVE10', subtotal: 200 }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
