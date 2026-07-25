import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';
import {
  packageHoursCreditFor,
  planPackageHoursRedemption,
  resolvePackageHourValue,
} from '@nanny-app/shared';
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
 * What a package-hours movement was drawn for: a booking, or a mid-shift
 * extension of one. Exactly one id is ever set. The ledger carries a separate
 * uniqueness key per scope, so keeping them distinct is what makes a refund
 * idempotent — an extension recorded under its parent booking's id would
 * collide with the booking's own movements.
 */
export type PackageHoursScope = { bookingId: number } | { bookingExtensionId: number };

/** The ledger columns for a scope — the unused side is explicitly null. */
function scopeColumns(scope: PackageHoursScope): {
  bookingId: number | null;
  bookingExtensionId: number | null;
} {
  return 'bookingId' in scope
    ? { bookingId: scope.bookingId, bookingExtensionId: null }
    : { bookingId: null, bookingExtensionId: scope.bookingExtensionId };
}

/** How a scope reads in a ledger `reason` string. */
function scopeLabel(scope: PackageHoursScope): string {
  return 'bookingId' in scope
    ? `booking #${scope.bookingId}`
    : `extension #${scope.bookingExtensionId}`;
}

/**
 * FIFO consume across a user's active buckets, soonest-to-expire first.
 * Returns the hours actually applied (short of `hoursNeeded` when the
 * balance runs out) plus the free-skill allowance (the max maxSkillsSnapshot
 * among the buckets that were drawn from).
 */
export async function redeemPackageHours(
  db: Db,
  params: { userId: number; scope: PackageHoursScope; hoursNeeded: number },
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
        ...scopeColumns(params.scope),
        reason: `Applied ${take}h to ${scopeLabel(params.scope)}`,
      },
    });

    maxSkillsAllowed = Math.max(maxSkillsAllowed, b.maxSkillsSnapshot);
    purchaseIds.push(b.id);
    remaining = round2(remaining - take);
  }

  return { hoursApplied: round2(params.hoursNeeded - remaining), maxSkillsAllowed, purchaseIds };
}

/**
 * Reverse a scope's redemption into the originating buckets (skips buckets that have since
 * expired). Idempotent: a REDEMPTION row that already has a matching REFUND row for this
 * scope + purchaseId is skipped, so calling this twice for the same booking or extension
 * (client retry, an admin/user cancel race, a webhook replay) only refunds once. The ledger
 * itself is the guard — no separate "already refunded" flag is needed.
 */
export async function refundPackageHours(db: Db, scope: PackageHoursScope): Promise<number> {
  const scopeWhere = scopeColumns(scope);
  const debits = await db.packageHoursLedger.findMany({
    where: { ...scopeWhere, type: 'REDEMPTION', deletedAt: null },
  });
  if (debits.length === 0) return 0;

  const existingRefunds = await db.packageHoursLedger.findMany({
    where: { ...scopeWhere, type: 'REFUND', deletedAt: null },
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
        ...scopeWhere,
        reason: `Refunded ${restore}h from ${scopeLabel(scope)}`,
      },
    });
    refunded = round2(refunded + restore);
  }
  return refunded;
}

/**
 * Re-point a booking's package-hour reservation to a freshly re-priced total, in
 * place — the recompute path for an admin edit. Unlike refund + redeem this
 * writes NO REFUND rows and never inserts a duplicate REDEMPTION for a bucket the
 * booking already drew from: it restores the old draw, then REVIVES/updates the
 * existing REDEMPTION rows (or soft-deletes the ones no longer used). Two reasons
 * this matters:
 *   1. The (booking_id, purchase_id, type) unique key forbids a second live
 *      REDEMPTION row for the same bucket — a plain re-redeem would collide.
 *   2. `refundPackageHours` keys its idempotency off REFUND rows; writing REFUND
 *      rows here would make a later cancel think the (new) hours were already
 *      returned and skip them. So we move balances in place instead.
 *
 * Returns the new credit basis for the caller to fold into the booking snapshot.
 * `totalAmountBeforePackage` is the booking total with promo + Care Points
 * already applied but BEFORE any package credit — the same figure createBooking
 * feeds `planPackageHoursRedemption`.
 */
export async function reapplyPackageHoursForBooking(
  db: Db,
  params: {
    bookingId: number;
    userId: number;
    baseRate: number;
    durationMultiplier: number;
    durationHours: number;
    totalAmountBeforePackage: number;
    skillFeesPerHour: number[];
    /** Skip package hours entirely (the admin turned `usePackageHours` off). */
    apply: boolean;
  },
): Promise<{ hoursApplied: number; skillsCovered: number; creditAmount: number }> {
  // Every REDEMPTION row this booking ever wrote, live or soft-deleted — the
  // soft-deleted ones are revivable slots so a re-drawn bucket updates its row
  // rather than colliding on the unique key.
  const priorRows = await db.packageHoursLedger.findMany({
    where: { bookingId: params.bookingId, type: 'REDEMPTION' },
  });
  const reusable = new Map(priorRows.map((r) => [r.purchaseId, r]));

  // 1. Restore the CURRENT (live) reservation back to its buckets.
  for (const row of priorRows) {
    if (row.deletedAt) continue;
    const restore = Math.abs(Number(row.hours));
    if (restore > 0) {
      await db.packagePurchase.updateMany({
        where: { id: row.purchaseId, status: 'ACTIVE', deletedAt: null },
        data: { hoursRemaining: { increment: restore } },
      });
    }
  }

  const drawnPurchaseIds = new Set<number>();
  let hoursApplied = 0;
  let skillsCovered = 0;
  let creditAmount = 0;

  if (params.apply) {
    // 2. Plan the new draw against the freshly restored balances.
    const summary = await getRedeemableSummary(params.userId, db);
    const plan = planPackageHoursRedemption({
      baseRate: params.baseRate,
      durationMultiplier: params.durationMultiplier || 1,
      totalAmount: params.totalAmountBeforePackage,
      durationHours: params.durationHours,
      availableHours: summary.availableHours,
      maxSkillsAllowed: summary.maxSkillsAllowed,
      skillFeesPerHour: params.skillFeesPerHour,
    });

    if (plan.hoursToRedeem > 0) {
      // 3. FIFO draw across active buckets, updating/reviving each bucket's row.
      const buckets = await activeBuckets(params.userId, db);
      let remaining = round2(plan.hoursToRedeem);
      let maxSkillsAllowed = 0;

      for (const b of buckets) {
        if (remaining <= 0) break;
        const take = round2(Math.min(Number(b.hoursRemaining), remaining));
        if (take <= 0) continue;

        const debited = await db.packagePurchase.updateMany({
          where: { id: b.id, status: 'ACTIVE', deletedAt: null, hoursRemaining: { gte: take } },
          data: { hoursRemaining: { decrement: take } },
        });
        if (debited.count === 0) continue;

        const fresh = await db.packagePurchase.findFirst({
          where: { id: b.id },
          select: { hoursRemaining: true },
        });
        const balanceAfter = round2(Number(fresh?.hoursRemaining ?? 0));

        const existing = reusable.get(b.id);
        if (existing) {
          await db.packageHoursLedger.update({
            where: { id: existing.id },
            data: {
              hours: -take,
              balanceAfter,
              deletedAt: null,
              reason: `Applied ${take}h to booking #${params.bookingId}`,
            },
          });
          reusable.delete(b.id);
        } else {
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
        }

        drawnPurchaseIds.add(b.id);
        maxSkillsAllowed = Math.max(maxSkillsAllowed, b.maxSkillsSnapshot);
        remaining = round2(remaining - take);
      }

      hoursApplied = round2(plan.hoursToRedeem - remaining);
      if (hoursApplied > 0) {
        const actual = resolvePackageHourValue({
          baseRate: params.baseRate,
          durationMultiplier: params.durationMultiplier || 1,
          maxSkillsAllowed,
          skillFeesPerHour: params.skillFeesPerHour,
        });
        creditAmount = packageHoursCreditFor({
          hoursApplied,
          creditPerHour: actual.creditPerHour,
          totalAmount: params.totalAmountBeforePackage,
        });
        skillsCovered = actual.skillsCovered;
      }
    }
  }

  // 4. Soft-delete any prior REDEMPTION row for a bucket we no longer draw from,
  // so `refundPackageHours` (which scans live rows) only ever sees the current
  // reservation. Rows already reused above were removed from `reusable`.
  for (const [purchaseId, row] of reusable) {
    if (drawnPurchaseIds.has(purchaseId) || row.deletedAt) continue;
    await db.packageHoursLedger.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
  }

  return { hoursApplied, skillsCovered, creditAmount };
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
