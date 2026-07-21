import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Why a capture did or didn't grant hours.
 * - CREDITED         hours granted, PURCHASE ledger row written.
 * - ALREADY_CREDITED a replayed capture; the first one already granted them.
 * - SLOT_TAKEN       the parent already holds an active package, so this purchase
 *                    stays PENDING_PAYMENT. The caller MUST still record the
 *                    payment — the money was taken and needs resolving by hand.
 * - NO_PAYMENT       no captured payment exists for this purchase, so nothing was
 *                    activated. Only reachable by misuse; the normal capture path
 *                    marks the payment CAPTURED before calling.
 */
export type CreditOutcome = 'CREDITED' | 'ALREADY_CREDITED' | 'SLOT_TAKEN' | 'NO_PAYMENT';

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
 * What the user could spend right now, without debiting anything. Callers need
 * the free-skill allowance to price a redemption BEFORE committing to it — see
 * planPackageHoursRedemption.
 */
export async function getRedeemableSummary(
  userId: number,
  db: Db = prisma,
): Promise<{ availableHours: number; maxSkillsAllowed: number }> {
  const buckets = await activeBuckets(userId, db);
  return {
    availableHours: round2(buckets.reduce((sum, b) => sum + Number(b.hoursRemaining), 0)),
    maxSkillsAllowed: buckets.reduce((max, b) => Math.max(max, b.maxSkillsSnapshot), 0),
  };
}

/**
 * Idempotent: turn a paid purchase into usable hours + a PURCHASE ledger row.
 * Called on payment capture. `expiresAt` is computed once at purchase-creation
 * time (now + the package's validityDays) and stored on the row, so this
 * function only promotes PENDING_PAYMENT → ACTIVE using that stored value.
 */
export async function creditPurchaseHours(
  db: Db,
  purchaseId: number,
): Promise<CreditOutcome> {
  const purchase = await db.packagePurchase.findFirst({
    where: { id: purchaseId, deletedAt: null },
  });
  if (!purchase) throw errors.notFound('Package purchase not found');
  if (purchase.status !== 'PENDING_PAYMENT') return 'ALREADY_CREDITED'; // idempotent

  // Defensive gate: a package is only ever activated off a genuinely captured
  // payment. The sole caller (finalizePackagePaymentCaptured) marks the payment
  // CAPTURED in this same transaction before calling us, so this always passes
  // there — but it makes "active package ⟹ a payment was captured" a
  // code-enforced invariant rather than an accident of call order, so a future
  // caller can't activate a purchase that was never paid for.
  const captured = await db.payment.findFirst({
    where: { packagePurchaseId: purchase.id, status: 'CAPTURED', deletedAt: null },
    select: { id: true },
  });
  if (!captured) return 'NO_PAYMENT';

  // The unique index on (userId, isActiveSlot) is what guarantees one active
  // package per user, but it must never be the thing that STOPS a capture:
  // letting the write hit it would abort the enclosing transaction and roll back
  // the payment's CAPTURED row, erasing the record of money Paymob already took.
  // So check for a free slot first and report back instead of throwing.
  const slotTaken = await db.packagePurchase.findFirst({
    where: { userId: purchase.userId, isActiveSlot: true, deletedAt: null },
  });
  if (slotTaken) return 'SLOT_TAKEN';

  const purchasedAt = new Date();

  // Conditional update rather than check-then-act: the status guard lives in the
  // WHERE clause, so a concurrent replay of the same capture matches zero rows
  // instead of crediting the hours (and writing a PURCHASE ledger row) twice.
  const promoted = await db.packagePurchase.updateMany({
    where: { id: purchase.id, status: 'PENDING_PAYMENT', deletedAt: null },
    data: {
      status: 'ACTIVE',
      isActiveSlot: true,
      hoursRemaining: purchase.hoursPurchased,
      purchasedAt,
      expiresAt: purchase.expiresAt,
    },
  });
  if (promoted.count === 0) return 'ALREADY_CREDITED'; // lost the race
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
  return 'CREDITED';
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
    const take = round2(Math.min(Number(b.hoursRemaining), remaining));
    if (take <= 0) continue;

    // Atomic conditional decrement, NOT a read-then-set. Writing an absolute
    // balance computed from the earlier read loses updates: two concurrent
    // bookings could both read 10h, both write 4h, and draw 12h from a 10h
    // bucket. The `gte` guard also makes a negative balance unrepresentable —
    // under READ COMMITTED the predicate is re-evaluated after the row lock is
    // released, so the loser of a race matches zero rows and moves on.
    const debited = await db.packagePurchase.updateMany({
      where: { id: b.id, status: 'ACTIVE', deletedAt: null, hoursRemaining: { gte: take } },
      data: { hoursRemaining: { decrement: take } },
    });
    if (debited.count === 0) continue; // another transaction took them first

    const fresh = await db.packagePurchase.findFirst({
      where: { id: b.id },
      select: { hoursRemaining: true },
    });
    const balanceAfter = round2(Number(fresh?.hoursRemaining ?? 0));

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

/**
 * Reverse a booking's redemption into the originating buckets (skips buckets that have since
 * expired). Idempotent: a REDEMPTION row that already has a matching REFUND row for this
 * bookingId + purchaseId is skipped, so calling this twice for the same booking (client retry,
 * an admin/user cancel race, a webhook replay) only refunds once. The ledger itself is the guard
 * — no separate "already refunded" flag is needed.
 */
export async function refundPackageHours(db: Db, bookingId: number): Promise<number> {
  const debits = await db.packageHoursLedger.findMany({
    where: { bookingId, type: 'REDEMPTION', deletedAt: null },
  });
  if (debits.length === 0) return 0;

  const existingRefunds = await db.packageHoursLedger.findMany({
    where: { bookingId, type: 'REFUND', deletedAt: null },
  });
  const alreadyRefundedPurchaseIds = new Set(existingRefunds.map((r) => r.purchaseId));

  let refunded = 0;
  for (const d of debits) {
    if (alreadyRefundedPurchaseIds.has(d.purchaseId)) continue;

    const purchase = await db.packagePurchase.findFirst({
      where: { id: d.purchaseId, deletedAt: null },
    });
    if (!purchase || purchase.status === 'EXPIRED') continue;

    const restore = Math.abs(Number(d.hours));

    // Atomic increment for the same reason redemption uses a decrement: an
    // absolute write computed from the read above would clobber a concurrent
    // redemption on the same bucket.
    const credited = await db.packagePurchase.updateMany({
      where: { id: purchase.id, status: 'ACTIVE', deletedAt: null },
      data: { hoursRemaining: { increment: restore } },
    });
    if (credited.count === 0) continue; // expired or refunded out from under us

    const fresh = await db.packagePurchase.findFirst({
      where: { id: purchase.id },
      select: { hoursRemaining: true },
    });
    const balanceAfter = round2(Number(fresh?.hoursRemaining ?? restore));

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
    // Close the status FIRST, without zeroing yet. The guard belongs in the
    // WHERE clause so two concurrent balance reads (a pull-to-refresh double
    // fire is enough) can't both forfeit the same bucket and write two EXPIRY
    // rows for one loss.
    // Clearing isActiveSlot alongside the status is what frees the parent to buy
    // again — leaving it set would lock them out permanently once a package expires.
    const expired = await db.packagePurchase.updateMany({
      where: { id: p.id, status: 'ACTIVE', deletedAt: null },
      data: { status: 'EXPIRED', isActiveSlot: null },
    });
    if (expired.count === 0) continue; // another caller expired it first

    // Only now read what is actually left. `stale` was read before the status
    // flip, so a booking that redeemed from this bucket in between would make
    // that snapshot too high — writing it to the ledger would leave
    // sum(ledger) permanently above hoursRemaining. Redemption requires
    // status ACTIVE, so nothing can draw from the bucket past this point.
    const fresh = await db.packagePurchase.findFirst({
      where: { id: p.id },
      select: { hoursRemaining: true },
    });
    const forfeited = round2(Number(fresh?.hoursRemaining ?? 0));

    await db.packagePurchase.updateMany({
      where: { id: p.id },
      data: { hoursRemaining: 0 },
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

  // Wrapped in a transaction so the status flip, the zeroing and the EXPIRY
  // ledger row commit together — a crash between them would otherwise leave the
  // ledger disagreeing with the bucket.
  await prisma.$transaction((tx) => expirePackagesForUser(user.id, tx));

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
