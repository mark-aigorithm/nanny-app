import { Prisma } from '@prisma/client';

import type {
  CreatePromoCodeInput,
  PromoCode,
  UpdatePromoCodeInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type PromoCodeRow = {
  id: string;
  code: string;
  discountType: 'FLAT' | 'PERCENTAGE';
  value: { toNumber(): number } | number;
  maxUsage: number | null;
  maxUsagePerUser: number | null;
  usageCount: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

function toDto(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    value: typeof row.value === 'number' ? row.value : row.value.toNumber(),
    maxUsage: row.maxUsage,
    maxUsagePerUser: row.maxUsagePerUser,
    usageCount: row.usageCount,
    isActive: row.isActive,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const rows = await prisma.promoCode.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function createPromoCode(input: CreatePromoCodeInput): Promise<PromoCode> {
  const existing = await prisma.promoCode.findUnique({ where: { code: input.code } });
  if (existing && existing.deletedAt === null) {
    throw errors.conflict(`Promo code "${input.code}" already exists`);
  }
  const row = await prisma.promoCode.create({
    data: {
      code: input.code,
      discountType: input.discountType,
      value: input.value,
      maxUsage: input.maxUsage ?? null,
      maxUsagePerUser: input.maxUsagePerUser ?? null,
      isActive: input.isActive,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  return toDto(row);
}

export async function updatePromoCode(
  id: string,
  input: UpdatePromoCodeInput,
): Promise<PromoCode> {
  const existing = await prisma.promoCode.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Promo code not found');

  const row = await prisma.promoCode.update({
    where: { id },
    data: {
      ...(input.discountType !== undefined && { discountType: input.discountType }),
      ...(input.value !== undefined && { value: input.value }),
      ...(input.maxUsage !== undefined && { maxUsage: input.maxUsage }),
      ...(input.maxUsagePerUser !== undefined && {
        maxUsagePerUser: input.maxUsagePerUser,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.expiresAt !== undefined && {
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
    },
  });
  return toDto(row);
}

export async function deletePromoCode(id: string): Promise<{ id: string }> {
  const existing = await prisma.promoCode.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Promo code not found');
  await prisma.promoCode.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/**
 * Read-only validation of a promo code for a given user against an applicable
 * amount (the gross total the discount applies to). Returns the code id and the
 * (soft-capped, unrounded) discount. Rounding + the final gross cap live in
 * calculatePriceBreakdown. Throws AppError on any invalid condition.
 */
export async function validatePromoCode(
  code: string,
  applicableAmount: number,
  userId: string,
): Promise<{ promoCodeId: string; discountAmount: number }> {
  const row = await prisma.promoCode.findFirst({ where: { code, deletedAt: null } });
  if (!row) throw errors.notFound(`Promo code "${code}" not found.`);
  if (!row.isActive) throw errors.badRequest('This promo code is no longer active.');
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw errors.badRequest('This promo code has expired.');
  }
  if (row.maxUsage !== null && row.usageCount >= row.maxUsage) {
    throw errors.badRequest('This promo code has been fully redeemed.');
  }
  if (row.maxUsagePerUser !== null) {
    const used = await prisma.promoCodeRedemption.count({
      where: { promoCodeId: row.id, userId, deletedAt: null },
    });
    if (used >= row.maxUsagePerUser) {
      throw errors.badRequest('You have already used this promo code.');
    }
  }

  const value = typeof row.value === 'number' ? row.value : row.value.toNumber();
  const raw = row.discountType === 'FLAT' ? value : (applicableAmount * value) / 100;
  const discountAmount = Math.min(raw, applicableAmount);
  return { promoCodeId: row.id, discountAmount };
}

/**
 * Records consumption of a promo code inside the caller's transaction:
 * increments usageCount and inserts a redemption row. Kept separate from
 * validatePromoCode so validation never writes.
 */
export async function redeemPromoCode(
  tx: Prisma.TransactionClient,
  args: { promoCodeId: string; userId: string; bookingId: string },
): Promise<void> {
  await tx.promoCode.update({
    where: { id: args.promoCodeId },
    data: { usageCount: { increment: 1 } },
  });
  await tx.promoCodeRedemption.create({
    data: {
      promoCodeId: args.promoCodeId,
      userId: args.userId,
      bookingId: args.bookingId,
    },
  });
}
