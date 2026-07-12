import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    nannyProfile: { findUnique: jest.fn() },
    booking: { findFirst: jest.fn(), create: jest.fn() },
    promoCode: { findFirst: jest.fn(), update: jest.fn() },
    promoCodeRedemption: { count: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/app-settings.service', () => ({
  getServiceFeePercent: jest.fn(),
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue({}),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { getServiceFeePercent } from '@backend/services/app-settings.service';
import { createBooking } from '@backend/services/booking.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findMany: jest.Mock };
  nannyProfile: { findUnique: jest.Mock };
  booking: { findFirst: jest.Mock; create: jest.Mock };
  promoCode: { findFirst: jest.Mock; update: jest.Mock };
  promoCodeRedemption: { count: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};
const mockFee = getServiceFeePercent as jest.Mock;

const DECODED = { uid: 'fb-mother' } as never;

// A far-future date keeps isStandardBookingDateAllowed + "not in the past" happy.
const baseBody = {
  nannyProfileId: 'np-1',
  date: '2099-01-01',
  startTime: '2099-01-01T10:00:00.000Z',
  endTime: '2099-01-01T12:00:00.000Z',
};

function makeBookingRow(overrides: Record<string, unknown> = {}) {
  const start = new Date('2099-01-01T10:00:00.000Z');
  return {
    id: 'booking-1',
    motherId: 'mother-1',
    mother: { firstName: 'Jane', lastName: 'Mom', avatarUrl: null },
    nannyProfileId: 'np-1',
    nannyProfile: {
      id: 'np-1',
      hourlyRate: 100,
      user: { id: 'nanny-user-1', firstName: 'Elena', lastName: 'Nanny', avatarUrl: null, address: null },
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
    payment: null,
    review: null,
    createdAt: start,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'mother-1', role: Role.MOTHER, deletedAt: null });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.nannyProfile.findUnique.mockResolvedValue({ id: 'np-1', isProfileComplete: true, hourlyRate: 100 });
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.promoCodeRedemption.count.mockResolvedValue(0);
  mockFee.mockResolvedValue(6);
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
    expect(data.totalAmount).toBe(212);
    expect(res.discountAmount).toBe(0);
    expect(mockPrisma.promoCodeRedemption.create).not.toHaveBeenCalled();
  });

  it('applies a valid promo code, sets promoCodeId, and redeems atomically', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue({
      id: 'promo-1',
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
    const tx = {
      booking: {
        create: jest.fn().mockResolvedValue(
          makeBookingRow({ promoCodeId: 'promo-1', discountAmount: 50, totalAmount: 162 }),
        ),
      },
      promoCode: { update: jest.fn().mockResolvedValue({}) },
      promoCodeRedemption: { create: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await createBooking(DECODED, { ...baseBody, promoCode: 'SAVE50' } as never);

    const data = tx.booking.create.mock.calls[0][0].data;
    expect(data.promoCodeId).toBe('promo-1');
    expect(data.discountAmount).toBe(50);
    expect(data.subtotal).toBe(200); // nanny earnings untouched (Requirement 1)
    expect(data.serviceFeeAmount).toBe(12); // fee on full subtotal (Requirement 2)
    expect(data.totalAmount).toBe(162);
    expect(tx.promoCode.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { usageCount: { increment: 1 } },
    });
    expect(tx.promoCodeRedemption.create).toHaveBeenCalledWith({
      data: { promoCodeId: 'promo-1', userId: 'mother-1', bookingId: 'booking-1' },
    });
    expect(res.discountAmount).toBe(50);
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

    expect(res.id).toBe('booking-1');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.booking.create).not.toHaveBeenCalled();
    expect(mockPrisma.promoCode.findFirst).not.toHaveBeenCalled();
  });
});
