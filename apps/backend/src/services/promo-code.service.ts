import { BookingStatus, Prisma } from '@prisma/client';

import type {
  CreatePromoCodeInput,
  PromoCode,
  UpdatePromoCodeInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type PromoCodeRow = {
  id: number;
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
  id: number,
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

export async function deletePromoCode(id: number): Promise<{ id: number }> {
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
  userId: number,
): Promise<{ promoCodeId: number; discountAmount: number }> {
  const row = await prisma.promoCode.findFirst({ where: { code, deletedAt: null } });
  if (!row) throw errors.notFound(`Promo code "${code}" not found.`);
  if (!row.isActive) throw errors.badRequest('This promo code is no longer active.');
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw errors.badRequest('This promo code has expired.');
  }
  // A code is only *consumed* once its booking is paid, so usage caps must also
  // count the bookings currently holding it unpaid. Without this a mother could
  // sit on any number of pending requests all claiming a one-per-customer code.
  const reservedWhere: Prisma.BookingWhereInput = {
    promoCodeId: row.id,
    deletedAt: null,
    status: {
      in: [BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.PENDING_CONFIRMATION],
    },
  };

  if (row.maxUsage !== null) {
    const reserved = await prisma.booking.count({ where: reservedWhere });
    if (row.usageCount + reserved >= row.maxUsage) {
      throw errors.badRequest('This promo code has been fully redeemed.');
    }
  }
  if (row.maxUsagePerUser !== null) {
    const [used, reserved] = await Promise.all([
      prisma.promoCodeRedemption.count({
        where: { promoCodeId: row.id, userId, deletedAt: null },
      }),
      prisma.booking.count({ where: { ...reservedWhere, motherId: userId } }),
    ]);
    if (used + reserved >= row.maxUsagePerUser) {
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
 *
 * Call this only once a booking's payment is CAPTURED — see
 * {@link redeemBookingPromoCodeOnCapture}.
 */
export async function redeemPromoCode(
  tx: Prisma.TransactionClient,
  args: { promoCodeId: number; userId: number; bookingId: number },
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

/**
 * Consumes the promo code a booking reserved, at the moment its payment is
 * captured — a code is spent only against care that was actually paid for.
 *
 * Creating a booking merely *reserves* the discount (the code is stored on the
 * booking and reflected in its total). Requests that no nanny ever claims, that
 * the mother cancels, or whose payment fails must leave the code untouched.
 *
 * Idempotent: Paymob can deliver the same capture webhook more than once, and
 * the redemption row for a booking is the marker that it has already been
 * counted. Must be called inside the same transaction that captures the payment.
 */
export async function redeemBookingPromoCodeOnCapture(
  tx: Prisma.TransactionClient,
  bookingId: number,
): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { promoCodeId: true, motherId: true },
  });
  if (!booking?.promoCodeId) return;

  const already = await tx.promoCodeRedemption.findFirst({
    where: { bookingId, promoCodeId: booking.promoCodeId, deletedAt: null },
    select: { id: true },
  });
  if (already) return;

  await redeemPromoCode(tx, {
    promoCodeId: booking.promoCodeId,
    userId: booking.motherId,
    bookingId,
  });
}
