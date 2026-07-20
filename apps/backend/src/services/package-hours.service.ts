import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Active, non-expired buckets with hours left, soonest-to-expire first (FIFO). */
async function activeBuckets(userId: number, db: Db) {
  const rows = await db.packagePurchase.findMany({
    where: { userId, status: 'ACTIVE', deletedAt: null, hoursRemaining: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
  });
  const now = new Date();
  return rows.filter((r) => !r.expiresAt || r.expiresAt > now);
}

/** Total usable hours across a user's active, non-expired buckets. */
export async function getAvailableHours(userId: number, db: Db = prisma): Promise<number> {
  const buckets = await activeBuckets(userId, db);
  return round2(buckets.reduce((sum, b) => sum + Number(b.hoursRemaining), 0));
}

/**
 * Idempotent: turn a paid purchase into usable hours + a PURCHASE ledger row.
 * Called on payment capture. `expiresAt` is computed once at purchase-creation
 * time (now + the package's validityDays) and stored on the row, so this
 * function only promotes PENDING_PAYMENT → ACTIVE using that stored value.
 */
export async function creditPurchaseHours(db: Db, purchaseId: number): Promise<void> {
  const purchase = await db.packagePurchase.findFirst({
    where: { id: purchaseId, deletedAt: null },
  });
  if (!purchase) throw errors.notFound('Package purchase not found');
  if (purchase.status !== 'PENDING_PAYMENT') return; // already credited — idempotent

  const purchasedAt = new Date();

  await db.packagePurchase.update({
    where: { id: purchase.id },
    data: {
      status: 'ACTIVE',
      hoursRemaining: purchase.hoursPurchased,
      purchasedAt,
      expiresAt: purchase.expiresAt,
    },
  });
  await db.packageHoursLedger.create({
    data: {
      purchaseId: purchase.id,
      userId: purchase.userId,
      type: 'PURCHASE',
      hours: purchase.hoursPurchased,
      balanceAfter: purchase.hoursPurchased,
      reason: `Purchased ${purchase.nameSnapshot}`,
    },
  });
}

/**
 * FIFO consume across a user's active buckets, soonest-to-expire first.
 * Returns the hours actually applied (short of `hoursNeeded` when the
 * balance runs out) plus the free-skill allowance (the max maxSkillsSnapshot
 * among the buckets that were drawn from).
 */
export async function redeemPackageHours(
  db: Db,
  params: { userId: number; bookingId: number; hoursNeeded: number },
): Promise<{ hoursApplied: number; maxSkillsAllowed: number; purchaseIds: number[] }> {
  const buckets = await activeBuckets(params.userId, db);
  let remaining = round2(params.hoursNeeded);
  let maxSkillsAllowed = 0;
  const purchaseIds: number[] = [];

  for (const b of buckets) {
    if (remaining <= 0) break;
    const avail = Number(b.hoursRemaining);
    const take = round2(Math.min(avail, remaining));
    if (take <= 0) continue;
    const balanceAfter = round2(avail - take);

    await db.packagePurchase.update({
      where: { id: b.id },
      data: { hoursRemaining: balanceAfter },
    });
    await db.packageHoursLedger.create({
      data: {
        purchaseId: b.id,
        userId: params.userId,
        type: 'REDEMPTION',
        hours: -take,
        balanceAfter,
        bookingId: params.bookingId,
        reason: `Applied ${take}h to booking #${params.bookingId}`,
      },
    });

    maxSkillsAllowed = Math.max(maxSkillsAllowed, b.maxSkillsSnapshot);
    purchaseIds.push(b.id);
    remaining = round2(remaining - take);
  }

  return { hoursApplied: round2(params.hoursNeeded - remaining), maxSkillsAllowed, purchaseIds };
}

/** Reverse a booking's redemption into the originating buckets (skips buckets that have since expired). */
export async function refundPackageHours(db: Db, bookingId: number): Promise<number> {
  const debits = await db.packageHoursLedger.findMany({
    where: { bookingId, type: 'REDEMPTION', deletedAt: null },
  });

  let refunded = 0;
  for (const d of debits) {
    const purchase = await db.packagePurchase.findFirst({
      where: { id: d.purchaseId, deletedAt: null },
    });
    if (!purchase || purchase.status === 'EXPIRED') continue;

    const restore = Math.abs(Number(d.hours));
    const balanceAfter = round2(Number(purchase.hoursRemaining) + restore);

    await db.packagePurchase.update({
      where: { id: purchase.id },
      data: { hoursRemaining: balanceAfter },
    });
    await db.packageHoursLedger.create({
      data: {
        purchaseId: purchase.id,
        userId: d.userId,
        type: 'REFUND',
        hours: restore,
        balanceAfter,
        bookingId,
        reason: `Refunded ${restore}h from booking #${bookingId}`,
      },
    });
    refunded = round2(refunded + restore);
  }
  return refunded;
}

/** Lazy expiry: flip past-due ACTIVE buckets to EXPIRED + a forfeiture ledger row. */
export async function expirePackagesForUser(userId: number, db: Db = prisma): Promise<void> {
  const now = new Date();
  const stale = await db.packagePurchase.findMany({
    where: { userId, status: 'ACTIVE', deletedAt: null, expiresAt: { lt: now } },
  });

  for (const p of stale) {
    const forfeited = Number(p.hoursRemaining);
    await db.packagePurchase.update({
      where: { id: p.id },
      data: { status: 'EXPIRED', hoursRemaining: 0 },
    });
    if (forfeited > 0) {
      await db.packageHoursLedger.create({
        data: {
          purchaseId: p.id,
          userId,
          type: 'EXPIRY',
          hours: -forfeited,
          balanceAfter: 0,
          reason: `Expired ${forfeited}h`,
        },
      });
    }
  }
}

type PurchaseRow = {
  id: number;
  nameSnapshot: string;
  hoursPurchased: number;
  hoursRemaining: Prisma.Decimal;
  maxSkillsSnapshot: number;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'REFUNDED';
  purchasedAt: Date | null;
  expiresAt: Date | null;
};

function toPurchaseDto(r: PurchaseRow): PackagePurchase {
  return {
    id: r.id,
    packageName: r.nameSnapshot,
    hoursPurchased: r.hoursPurchased,
    hoursRemaining: Number(r.hoursRemaining),
    maxSkills: r.maxSkillsSnapshot,
    status: r.status,
    purchasedAt: r.purchasedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  };
}

/** Mobile: the signed-in parent's own package-hours balance + bucket history. */
export async function getMyPackageHours(firebaseUid: string): Promise<PackageHoursBalance> {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user || user.deletedAt) throw errors.notFound('User not found');

  await expirePackagesForUser(user.id);

  const rows = await prisma.packagePurchase.findMany({
    where: { userId: user.id, deletedAt: null, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
  });

  const now = new Date();
  const availableHours = round2(
    rows
      .filter((r) => r.status === 'ACTIVE' && (!r.expiresAt || r.expiresAt > now))
      .reduce((sum, r) => sum + Number(r.hoursRemaining), 0),
  );

  return { availableHours, buckets: rows.map(toPurchaseDto) };
}
