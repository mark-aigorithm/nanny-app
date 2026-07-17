import type { Prisma } from '@prisma/client';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    promoCode: { findFirst: jest.fn(), update: jest.fn() },
    promoCodeRedemption: { count: jest.fn(), create: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import { validatePromoCode, redeemPromoCode } from '@backend/services/promo-code.service';

const mockPrisma = prisma as unknown as {
  promoCode: { findFirst: jest.Mock; update: jest.Mock };
  promoCodeRedemption: { count: jest.Mock; create: jest.Mock };
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
