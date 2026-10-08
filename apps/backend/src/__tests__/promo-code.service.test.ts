import type { Prisma } from '@prisma/client';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    promoCode: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    promoCodeRedemption: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    // Usage caps also count bookings holding the code unpaid.
    booking: { count: jest.fn(), findUnique: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createPromoCode,
  deletePromoCode,
  listPromoCodes,
  releaseBookingPromoRedemption,
  updatePromoCode,
  validatePromoCode,
  redeemPromoCode,
  redeemBookingPromoCodeOnCapture,
} from '@backend/services/promo-code.service';

const mockPrisma = prisma as unknown as {
  promoCode: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  promoCodeRedemption: { count: jest.Mock; create: jest.Mock; findFirst: jest.Mock };
  booking: { count: jest.Mock; findUnique: jest.Mock };
};

const dec = (n: number) => ({ toNumber: () => n });

function makeCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 23,
    code: 'SAVE10',
    discountType: 'PERCENTAGE',
    value: dec(10),
    maxUsage: null,
    maxUsagePerUser: null,
    usageCount: 0,
    isActive: true,
    expiresAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.promoCodeRedemption.count.mockResolvedValue(0);
  mockPrisma.booking.count.mockResolvedValue(0);
});

describe('validatePromoCode', () => {
  it('throws notFound (404) when the code does not exist', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);
    await expect(validatePromoCode('NOPE', 100, 29)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws badRequest (400) when inactive', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ isActive: false }));
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws badRequest (400) when expired', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(
      makeCode({ expiresAt: new Date('2000-01-01T00:00:00.000Z') }),
    );
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws badRequest (400) when maxUsage is reached', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsage: 5, usageCount: 5 }));
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws badRequest (400) when the per-user limit is reached', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsagePerUser: 1 }));
    mockPrisma.promoCodeRedemption.count.mockResolvedValue(1);
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns the flat value for a FLAT code', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ discountType: 'FLAT', value: dec(50) }));
    const r = await validatePromoCode('SAVE10', 200, 29);
    expect(r).toEqual({ promoCodeId: 23, discountAmount: 50 });
  });

  it('returns applicableAmount * value / 100 for a PERCENTAGE code', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ discountType: 'PERCENTAGE', value: dec(10) }));
    const r = await validatePromoCode('SAVE10', 212, 29);
    expect(r.discountAmount).toBeCloseTo(21.2);
  });

  it('caps the discount at the applicable amount', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ discountType: 'FLAT', value: dec(500) }));
    const r = await validatePromoCode('SAVE10', 100, 29);
    expect(r.discountAmount).toBe(100);
  });
});

describe('redeemPromoCode', () => {
  it('increments usageCount and writes a redemption row', async () => {
    const tx = {
      promoCode: { update: jest.fn().mockResolvedValue({}) },
      promoCodeRedemption: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await redeemPromoCode(tx, { promoCodeId: 23, userId: 29, bookingId: 4 });

    expect((tx.promoCode.update as jest.Mock).mock.calls[0][0]).toEqual({
      where: { id: 23 },
      data: { usageCount: { increment: 1 } },
    });
    expect((tx.promoCodeRedemption.create as jest.Mock).mock.calls[0][0]).toEqual({
      data: { promoCodeId: 23, userId: 29, bookingId: 4 },
    });
  });
});

describe('redeemBookingPromoCodeOnCapture', () => {
  /** A tx double that also carries the booking lookup the helper does. */
  function makeTx(
    booking: { promoCodeId: number | null; motherId: number } | null,
    existingRedemption: { id: number } | null = null,
  ) {
    return {
      booking: { findUnique: jest.fn().mockResolvedValue(booking) },
      promoCode: { update: jest.fn().mockResolvedValue({}) },
      promoCodeRedemption: {
        findFirst: jest.fn().mockResolvedValue(existingRedemption),
        create: jest.fn().mockResolvedValue({}),
      },
    } as unknown as Prisma.TransactionClient;
  }

  it('consumes the code the booking reserved', async () => {
    const tx = makeTx({ promoCodeId: 23, motherId: 29 });

    await redeemBookingPromoCodeOnCapture(tx, 4);

    expect((tx.promoCode.update as jest.Mock).mock.calls[0][0]).toEqual({
      where: { id: 23 },
      data: { usageCount: { increment: 1 } },
    });
    expect((tx.promoCodeRedemption.create as jest.Mock).mock.calls[0][0]).toEqual({
      data: { promoCodeId: 23, userId: 29, bookingId: 4 },
    });
  });

  it('does nothing when the booking reserved no code', async () => {
    const tx = makeTx({ promoCodeId: null, motherId: 29 });

    await redeemBookingPromoCodeOnCapture(tx, 4);

    expect(tx.promoCode.update as jest.Mock).not.toHaveBeenCalled();
    expect(tx.promoCodeRedemption.create as jest.Mock).not.toHaveBeenCalled();
  });

  // Paymob can deliver the same capture webhook twice; the second must be a no-op.
  it('is idempotent when a redemption already exists for the booking', async () => {
    const tx = makeTx({ promoCodeId: 23, motherId: 29 }, { id: 77 });

    await redeemBookingPromoCodeOnCapture(tx, 4);

    expect(tx.promoCode.update as jest.Mock).not.toHaveBeenCalled();
    expect(tx.promoCodeRedemption.create as jest.Mock).not.toHaveBeenCalled();
  });
});

describe('validatePromoCode usage caps', () => {
  it('counts bookings holding the code unpaid against maxUsagePerUser', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsagePerUser: 1 }));
    mockPrisma.promoCodeRedemption.count.mockResolvedValue(0);
    // Nothing redeemed yet, but one pending booking is already claiming it.
    mockPrisma.booking.count.mockResolvedValue(1);

    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('counts bookings holding the code unpaid against maxUsage', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsage: 5, usageCount: 4 }));
    mockPrisma.booking.count.mockResolvedValue(1);

    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Admin CRUD ───────────────────────────────────────────────────────────────

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');

function makeRow(overrides: Record<string, unknown> = {}) {
  return { ...makeCode(), createdAt: CREATED_AT, ...overrides };
}

describe('listPromoCodes', () => {
  it('lists live codes newest first, mapping Decimal values and dates to the DTO', async () => {
    mockPrisma.promoCode.findMany.mockResolvedValue([
      makeRow({ expiresAt: new Date('2026-12-31T00:00:00.000Z') }),
      makeRow({ id: 24, code: 'FLAT5', discountType: 'FLAT', value: 5 }),
    ]);

    const r = await listPromoCodes();

    expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(r).toEqual([
      {
        id: 23,
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        value: 10,
        maxUsage: null,
        maxUsagePerUser: null,
        usageCount: 0,
        isActive: true,
        expiresAt: '2026-12-31T00:00:00.000Z',
        createdAt: CREATED_AT.toISOString(),
      },
      expect.objectContaining({ id: 24, value: 5, expiresAt: null }),
    ]);
  });
});

describe('createPromoCode', () => {
  const input = {
    code: 'NEW20',
    discountType: 'PERCENTAGE' as const,
    value: 20,
    isActive: true,
  };

  it('refuses a code that already exists live with a 409', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue(makeRow({ code: 'NEW20' }));

    await expect(createPromoCode(input)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Promo code "NEW20" already exists',
    });
    expect(mockPrisma.promoCode.create).not.toHaveBeenCalled();
  });

  it('allows reusing the code of a soft-deleted promo', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue(makeRow({ deletedAt: new Date() }));
    mockPrisma.promoCode.create.mockResolvedValue(makeRow({ code: 'NEW20', value: dec(20) }));

    const r = await createPromoCode(input);

    expect(r.code).toBe('NEW20');
    expect(r.value).toBe(20);
  });

  it('defaults optional caps and expiry to null', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue(null);
    mockPrisma.promoCode.create.mockResolvedValue(makeRow());

    await createPromoCode(input);

    expect(mockPrisma.promoCode.create).toHaveBeenCalledWith({
      data: {
        code: 'NEW20',
        discountType: 'PERCENTAGE',
        value: 20,
        maxUsage: null,
        maxUsagePerUser: null,
        isActive: true,
        expiresAt: null,
      },
    });
  });

  it('stores the given caps and parses the expiry into a Date', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue(null);
    mockPrisma.promoCode.create.mockResolvedValue(makeRow());

    await createPromoCode({
      ...input,
      maxUsage: 100,
      maxUsagePerUser: 2,
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    expect(mockPrisma.promoCode.create.mock.calls[0][0].data).toMatchObject({
      maxUsage: 100,
      maxUsagePerUser: 2,
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    });
  });
});

describe('updatePromoCode', () => {
  it('throws 404 when the code does not exist or was deleted', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);

    await expect(updatePromoCode(23, { isActive: false })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Promo code not found',
    });
    expect(mockPrisma.promoCode.findFirst).toHaveBeenCalledWith({
      where: { id: 23, deletedAt: null },
    });
    expect(mockPrisma.promoCode.update).not.toHaveBeenCalled();
  });

  it('writes nothing for fields that were not sent', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeRow());
    mockPrisma.promoCode.update.mockResolvedValue(makeRow());

    await updatePromoCode(23, {});

    expect(mockPrisma.promoCode.update).toHaveBeenCalledWith({ where: { id: 23 }, data: {} });
  });

  it('writes every field that was sent, parsing the expiry into a Date', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeRow());
    mockPrisma.promoCode.update.mockResolvedValue(makeRow({ discountType: 'FLAT', value: dec(30) }));

    const r = await updatePromoCode(23, {
      discountType: 'FLAT',
      value: 30,
      maxUsage: 10,
      maxUsagePerUser: 1,
      isActive: false,
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    expect(mockPrisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 23 },
      data: {
        discountType: 'FLAT',
        value: 30,
        maxUsage: 10,
        maxUsagePerUser: 1,
        isActive: false,
        expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    expect(r.value).toBe(30);
  });

  it('clears caps and expiry when they are sent as null', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeRow());
    mockPrisma.promoCode.update.mockResolvedValue(makeRow());

    await updatePromoCode(23, { maxUsage: null, maxUsagePerUser: null, expiresAt: null });

    expect(mockPrisma.promoCode.update.mock.calls[0][0].data).toEqual({
      maxUsage: null,
      maxUsagePerUser: null,
      expiresAt: null,
    });
  });
});

describe('deletePromoCode', () => {
  it('throws 404 when the code does not exist or was already deleted', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);

    await expect(deletePromoCode(23)).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.promoCode.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the code and returns its id', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeRow());
    mockPrisma.promoCode.update.mockResolvedValue({});

    await expect(deletePromoCode(23)).resolves.toEqual({ id: 23 });
    expect(mockPrisma.promoCode.update).toHaveBeenCalledWith({
      where: { id: 23 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

// ── validatePromoCode: messages, boundaries and the reserved-booking query ───

describe('validatePromoCode guards', () => {
  it('looks the code up among live (not soft-deleted) codes only', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);

    await expect(validatePromoCode('NOPE', 100, 29)).rejects.toMatchObject({
      message: 'Promo code "NOPE" not found.',
    });
    expect(mockPrisma.promoCode.findFirst).toHaveBeenCalledWith({
      where: { code: 'NOPE', deletedAt: null },
    });
  });

  it('says the code is no longer active when it was switched off', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ isActive: false }));
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({
      message: 'This promo code is no longer active.',
    });
  });

  it('treats a code expiring exactly now as expired', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    jest.useFakeTimers({ now });
    try {
      mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ expiresAt: now }));
      await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({
        message: 'This promo code has expired.',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts a code that expires in the future', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(
      makeCode({ expiresAt: new Date(Date.now() + 60_000) }),
    );
    await expect(validatePromoCode('SAVE10', 100, 29)).resolves.toEqual({
      promoCodeId: 23,
      discountAmount: 10,
    });
  });

  it('says the code is fully redeemed when the global cap is reached', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsage: 5, usageCount: 5 }));
    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({
      message: 'This promo code has been fully redeemed.',
    });
  });

  it('accepts a code with one global use left once reservations are counted', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsage: 5, usageCount: 3 }));
    mockPrisma.booking.count.mockResolvedValue(1);

    await expect(validatePromoCode('SAVE10', 100, 29)).resolves.toMatchObject({ promoCodeId: 23 });
  });

  it('counts only live unpaid bookings holding the code toward the global cap', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsage: 5 }));

    await validatePromoCode('SAVE10', 100, 29);

    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: {
        promoCodeId: 23,
        deletedAt: null,
        status: { in: ['PENDING', 'APPROVED', 'PENDING_CONFIRMATION'] },
      },
    });
  });

  it('does not count bookings at all when the code has no caps', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode());

    await validatePromoCode('SAVE10', 100, 29);

    expect(mockPrisma.booking.count).not.toHaveBeenCalled();
    expect(mockPrisma.promoCodeRedemption.count).not.toHaveBeenCalled();
  });

  it('excludes the booking being re-validated from both caps', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(
      makeCode({ maxUsage: 5, maxUsagePerUser: 1 }),
    );

    await validatePromoCode('SAVE10', 100, 29, { excludeBookingId: 4 });

    expect(mockPrisma.booking.count).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ id: { not: 4 } }),
    });
    expect(mockPrisma.booking.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ id: { not: 4 }, motherId: 29 }),
    });
  });

  it('counts the user’s live redemptions and her own reservations toward the per-user cap', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsagePerUser: 2 }));
    mockPrisma.promoCodeRedemption.count.mockResolvedValue(1);
    mockPrisma.booking.count.mockResolvedValue(1);

    await expect(validatePromoCode('SAVE10', 100, 29)).rejects.toMatchObject({
      message: 'You have already used this promo code.',
    });
    expect(mockPrisma.promoCodeRedemption.count).toHaveBeenCalledWith({
      where: { promoCodeId: 23, userId: 29, deletedAt: null },
    });
    expect(mockPrisma.booking.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ promoCodeId: 23, motherId: 29 }),
    });
  });

  it('accepts a code while the user is under the per-user cap', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ maxUsagePerUser: 2 }));
    mockPrisma.promoCodeRedemption.count.mockResolvedValue(1);

    await expect(validatePromoCode('SAVE10', 100, 29)).resolves.toMatchObject({ promoCodeId: 23 });
  });

  it('accepts a plain-number value as well as a Decimal', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ discountType: 'FLAT', value: 15 }));
    await expect(validatePromoCode('SAVE10', 100, 29)).resolves.toEqual({
      promoCodeId: 23,
      discountAmount: 15,
    });
  });

  it('caps a 100%+ percentage discount at the applicable amount', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ value: dec(150) }));
    const r = await validatePromoCode('SAVE10', 80, 29);
    expect(r.discountAmount).toBe(80);
  });

  it('leaves the percentage discount unrounded (rounding happens in the price breakdown)', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(makeCode({ value: dec(15) }));
    const r = await validatePromoCode('SAVE10', 33.33, 29);
    expect(r.discountAmount).toBeCloseTo(4.9995, 6);
  });
});

describe('releaseBookingPromoRedemption', () => {
  function makeTx(redemption: { id: number; promoCodeId: number } | null) {
    return {
      promoCodeRedemption: {
        findFirst: jest.fn().mockResolvedValue(redemption),
        update: jest.fn().mockResolvedValue({}),
      },
      promoCode: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as unknown as Prisma.TransactionClient;
  }

  it('is a no-op that returns null when the booking never spent a code', async () => {
    const tx = makeTx(null);

    await expect(releaseBookingPromoRedemption(tx, 4)).resolves.toBeNull();
    expect(tx.promoCodeRedemption.findFirst as jest.Mock).toHaveBeenCalledWith({
      where: { bookingId: 4, deletedAt: null },
      select: { id: true, promoCodeId: true },
    });
    expect(tx.promoCodeRedemption.update as jest.Mock).not.toHaveBeenCalled();
    expect(tx.promoCode.updateMany as jest.Mock).not.toHaveBeenCalled();
  });

  it('soft-deletes the redemption and gives the use back to the code', async () => {
    const tx = makeTx({ id: 77, promoCodeId: 23 });

    await expect(releaseBookingPromoRedemption(tx, 4)).resolves.toEqual({ promoCodeId: 23 });
    expect(tx.promoCodeRedemption.update as jest.Mock).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { deletedAt: expect.any(Date) },
    });
    // Conditional on usageCount > 0 so the counter can never go negative.
    expect(tx.promoCode.updateMany as jest.Mock).toHaveBeenCalledWith({
      where: { id: 23, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  });

  it('still releases the redemption when the usage counter is already at zero', async () => {
    const tx = makeTx({ id: 77, promoCodeId: 23 });
    (tx.promoCode.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    await expect(releaseBookingPromoRedemption(tx, 4)).resolves.toEqual({ promoCodeId: 23 });
    expect(tx.promoCodeRedemption.update as jest.Mock).toHaveBeenCalled();
  });
});

describe('redeemBookingPromoCodeOnCapture lookups', () => {
  it('does nothing when the booking does not exist', async () => {
    const tx = {
      booking: { findUnique: jest.fn().mockResolvedValue(null) },
      promoCodeRedemption: { findFirst: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await redeemBookingPromoCodeOnCapture(tx, 4);

    expect(tx.promoCodeRedemption.findFirst as jest.Mock).not.toHaveBeenCalled();
  });

  it('checks for an existing live redemption of this code on this booking', async () => {
    const tx = {
      booking: { findUnique: jest.fn().mockResolvedValue({ promoCodeId: 23, motherId: 29 }) },
      promoCodeRedemption: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    } as unknown as Prisma.TransactionClient;

    await redeemBookingPromoCodeOnCapture(tx, 4);

    expect(tx.promoCodeRedemption.findFirst as jest.Mock).toHaveBeenCalledWith({
      where: { bookingId: 4, promoCodeId: 23, deletedAt: null },
      select: { id: true },
    });
  });
});
