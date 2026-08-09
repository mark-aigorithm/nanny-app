import { BookingStatus, NotificationType, PaymentStatus, Prisma } from '@prisma/client';

import { isBookingWithinDailyWindow } from '@nanny-app/shared';
import type {
  AdminBookingDetail,
  AdminBookingEditContext,
  AdminEditBookingCommitInput,
  AdminEditBookingInput,
  AdminEditPreviewResponse,
  AdminEditWarning,
  AdminRefundBookingInput,
  AdminRefundResponse,
  BookingMoneySummary,
  BookingSettlement,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { AppError, errors } from '@backend/lib/errors';

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;
import { toPlatformDateColumn, wallClockToUtc } from '@backend/lib/platform-time';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import { getPlatformConfig } from '@backend/services/app-settings.service';
import {
  assertNoConflict,
  computeDurationHours,
} from '@backend/services/booking.service';
import { getAdminBooking } from '@backend/services/admin-booking.service';
import {
  buildBreakdown,
  getPricingInputs,
  type PricingInputs,
} from '@backend/services/pricing-config.service';
import { validatePromoCode } from '@backend/services/promo-code.service';
import {
  applyBookingRedemption,
  getOrCreateWallet,
  getRewardConfig,
  grantPoints,
  refundBookingRedemption,
} from '@backend/services/reward.service';
import {
  getAvailableHours,
  reapplyPackageHoursForBooking,
  refundPackageHours,
} from '@backend/services/package-hours.service';
import { refundBookingPayment } from '@backend/services/payment-refund.service';

/** Money comparisons tolerate sub-cent float noise. */
const EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: Prisma.Decimal | number): number {
  return typeof value === 'number' ? value : value.toNumber();
}

/** Statuses in which a booking's details may still be edited (pre-service). */
const EDITABLE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.CONFIRMED,
];

const editInclude = {
  mother: { select: { id: true } },
  nannyProfile: { select: { id: true, user: { select: { id: true } } } },
  promoCode: { select: { id: true, code: true, discountType: true, value: true } },
  payments: {
    where: { deletedAt: null },
    select: { amount: true, refundedAmount: true, status: true },
  },
} satisfies Prisma.BookingInclude;

type EditBookingRow = Prisma.BookingGetPayload<{ include: typeof editInclude }>;

async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
  const admin = await prisma.user.findFirst({
    where: {
      firebaseUid: adminFirebaseUid,
      deletedAt: null,
      role: { in: ['ADMIN', 'SUPERUSER', 'OPERATOR'] },
    },
    select: { id: true },
  });
  if (!admin) throw errors.forbidden('Admin access required');
  return admin.id;
}

/** In-app + push, mirroring admin-booking.service's notifyBookingParty. Best-effort push. */
async function notifyBookingParty(
  userId: number,
  type: NotificationType,
  pushType: string,
  title: string,
  body: string,
  bookingId: number,
): Promise<void> {
  await createInAppNotification({
    userId,
    type,
    title,
    body,
    referenceId: bookingId,
    referenceType: 'BOOKING',
  });
  await dispatchPush(userId, {
    title,
    body,
    data: { type: pushType, bookingId: String(bookingId), title },
  });
}

/** Sum of money the mother has actually paid and kept: captured minus refunded. */
function sumCapturedPaid(payments: { amount: Prisma.Decimal; refundedAmount: Prisma.Decimal; status: PaymentStatus }[]): number {
  const paid = payments
    .filter((p) => p.status === PaymentStatus.CAPTURED || p.status === PaymentStatus.REFUNDED)
    .reduce((sum, p) => sum + (num(p.amount) - num(p.refundedAmount)), 0);
  return round2(paid);
}

function money(n: number): string {
  return `EGP ${n.toFixed(2)}`;
}

// ── Pricing plan (shared by preview + commit) ──────────────────────────────────

interface EditPlan {
  startTime: Date;
  endTime: Date;
  durationHours: number;
  childrenCount: number;
  /** Post-promo breakdown (before package/points credits). */
  breakdown: ReturnType<typeof buildBreakdown>;
  baseRateForPricing: number;
  promoCodeId: number | null;
  promoDiscount: number;
  usePackage: boolean;
  carePointsHours: number;
  /** Simulated credits — commit recomputes the authoritative figures. */
  simPackageHours: number;
  simPackageCredit: number;
  simPackageSkills: number;
  simPointsHours: number;
  simPointsCost: number;
  simPointsDiscount: number;
  simFinalTotal: number;
  warnings: AdminEditWarning[];
}

function block(code: string, message: string, field?: string): AdminEditWarning {
  return { code, severity: 'block', message, field };
}
function warn(code: string, message: string, field?: string): AdminEditWarning {
  return { code, severity: 'warn', message, field };
}

/**
 * Pure(ish) re-price of a proposed edit against the current config + the booking
 * snapshot. Reads only. Collects blocking + soft warnings and simulates the
 * package/Care-Points credits so the preview can show the money impact.
 */
async function buildEditPlan(
  db: Db,
  booking: EditBookingRow,
  input: AdminEditBookingInput,
): Promise<EditPlan> {
  const warnings: AdminEditWarning[] = [];
  const config = await getPlatformConfig();
  const pricingInputs = await getPricingInputs();

  if (!EDITABLE_STATUSES.includes(booking.status)) {
    warnings.push(
      block('STATUS', `A ${booking.status.toLowerCase()} booking can no longer be edited.`),
    );
  }

  // ── Schedule ──
  if (input.endTime <= input.startTime) {
    warnings.push(block('TIME_ORDER', 'The start time must be before the end time.', 'endTime'));
  }
  const startTime = wallClockToUtc(input.startTime);
  const endTime = wallClockToUtc(input.endTime);
  const durationHours = Math.max(0, computeDurationHours(startTime, endTime));
  if (durationHours < config.minBookingHours) {
    warnings.push(block('MIN_DURATION', `Minimum booking duration is ${config.minBookingHours} hours.`, 'startTime'));
  }
  if (durationHours > config.maxBookingHours) {
    warnings.push(block('MAX_DURATION', `Maximum booking duration is ${config.maxBookingHours} hours.`, 'endTime'));
  }
  // Window + lead time are soft: an admin fixing a live booking may need times a
  // parent couldn't have requested (mirrors updateBookingTimes).
  if (!isBookingWithinDailyWindow(input.startTime, input.endTime, config.bookingWindowStartHour, config.bookingWindowEndHour)) {
    warnings.push(warn('DAILY_WINDOW', `Outside the daily booking window (${config.bookingWindowStartHour}:00–${config.bookingWindowEndHour}:00).`, 'startTime'));
  }

  // ── Children ──
  const childrenCount = input.children.length;
  if (childrenCount > config.maxChildrenPerBooking) {
    warnings.push(block('CHILDREN_CEILING', `One nanny can care for at most ${config.maxChildrenPerBooking} children.`, 'children'));
  }

  // ── Nanny conflict (only if claimed) ──
  if (booking.nannyProfileId) {
    try {
      await assertNoConflict(booking.nannyProfileId, startTime, endTime, booking.id);
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'The assigned nanny has a conflicting booking.';
      warnings.push(block('NANNY_CONFLICT', message, 'startTime'));
    }
  }

  // ── Re-price at the booking's own snapshot base rate (protect the agreed rate) ──
  const baseRateForPricing = num(booking.baseRate) || pricingInputs.baseRate;
  if (round2(baseRateForPricing) !== round2(pricingInputs.baseRate)) {
    warnings.push(
      warn('BASE_RATE_DRIFT', `Priced at the booking's original rate (${money(baseRateForPricing)}/h); the current platform rate is ${money(pricingInputs.baseRate)}/h.`),
    );
  }
  const pricing: PricingInputs = { ...pricingInputs, baseRate: baseRateForPricing };
  const skillIds = input.skillIds ?? [];

  // Subtotal first (rejecting unknown/inactive skills as a hard block).
  let preSubtotal = 0;
  try {
    preSubtotal = buildBreakdown(pricing, { durationHours, skillIds, childrenCount }).subtotal;
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'One of the selected skills is unavailable.';
    warnings.push(block('UNKNOWN_SKILL', message, 'skillIds'));
  }

  // ── Promo ──
  const isPaid = booking.status === BookingStatus.CONFIRMED;
  const existingCode = booking.promoCode?.code ?? null;
  let promoCodeId: number | null = booking.promoCodeId;
  let promoDiscount = 0;

  const promoChanged = input.promoCode !== undefined && input.promoCode !== existingCode;
  if (input.promoCode === undefined) {
    // Unchanged: recompute the discount against the new subtotal directly from the
    // promo row (no cap re-check — it is already reserved/consumed for this booking).
    if (booking.promoCode) {
      const value = num(booking.promoCode.value);
      const raw = booking.promoCode.discountType === 'FLAT' ? value : (preSubtotal * value) / 100;
      promoDiscount = Math.min(round2(raw), preSubtotal);
    }
  } else if (input.promoCode === null) {
    if (isPaid && existingCode) {
      warnings.push(block('PROMO_LOCKED', 'The promo code cannot be changed after payment.', 'promoCode'));
    }
    promoCodeId = null;
    promoDiscount = 0;
  } else {
    // A new or different code.
    if (isPaid && promoChanged) {
      warnings.push(block('PROMO_LOCKED', 'The promo code cannot be changed after payment.', 'promoCode'));
    } else {
      try {
        const validated = await validatePromoCode(input.promoCode, preSubtotal, booking.mother.id, {
          excludeBookingId: booking.id,
        });
        promoCodeId = validated.promoCodeId;
        promoDiscount = validated.discountAmount;
      } catch (err) {
        const message = err instanceof AppError ? err.message : 'That promo code is not valid.';
        warnings.push(block('PROMO_INVALID', message, 'promoCode'));
      }
    }
  }

  const breakdown = buildBreakdown(pricing, {
    durationHours,
    skillIds,
    childrenCount,
    discountAmount: promoDiscount,
  });
  const postPromoTotal = breakdown.totalAmount;

  // ── Simulate package hours (order: promo → package → points, as at creation) ──
  const usePackage = input.usePackageHours !== false;
  let simPackageHours = 0;
  let simPackageCredit = 0;
  let simPackageSkills = 0;
  const availableWithReleased =
    (await getAvailableHours(booking.mother.id, db)) + num(booking.packageHoursApplied);
  if (usePackage && availableWithReleased > 0) {
    // Lightweight estimate: value each affordable hour at the effective rate,
    // capped at what's owed. The commit recomputes the exact figure from the
    // buckets FIFO actually draws.
    const perHour = breakdown.effectiveHourlyRate;
    const affordableHours = perHour > 0 ? Math.floor((postPromoTotal + EPSILON) / perHour) : 0;
    simPackageHours = Math.min(availableWithReleased, durationHours, affordableHours);
    simPackageCredit = Math.min(round2(simPackageHours * perHour), postPromoTotal);
  }
  const afterPackageTotal = round2(postPromoTotal - simPackageCredit);

  // ── Simulate Care Points ──
  const carePointsHours = input.carePointsHours ?? 0;
  let simPointsHours = 0;
  let simPointsCost = 0;
  let simPointsDiscount = 0;
  if (carePointsHours > 0) {
    const rewardConfig = await getRewardConfig(db);
    if (!rewardConfig.enabled) {
      warnings.push(block('POINTS_DISABLED', 'Care Points redemption is currently unavailable.', 'carePointsHours'));
    } else {
      const hours = Math.min(Math.floor(carePointsHours), Math.floor(durationHours));
      const pointsCost = hours * rewardConfig.redemptionPointsPerHour;
      const wallet = await getOrCreateWallet(booking.mother.id, db);
      if (hours < 1) {
        warnings.push(block('POINTS_MIN', 'Choose at least one hour of Care Points to redeem.', 'carePointsHours'));
      } else if (pointsCost < rewardConfig.minRedemptionPoints) {
        warnings.push(block('POINTS_MIN', `At least ${rewardConfig.minRedemptionPoints} points must be redeemed at a time.`, 'carePointsHours'));
      } else if (wallet.pointsBalance < pointsCost) {
        warnings.push(block('POINTS_BALANCE', 'The mother does not have enough Care Points for this redemption.', 'carePointsHours'));
      } else {
        simPointsHours = hours;
        simPointsCost = pointsCost;
        simPointsDiscount = Math.min(round2(hours * breakdown.effectiveHourlyRate), afterPackageTotal);
      }
    }
  }

  const simFinalTotal = round2(afterPackageTotal - simPointsDiscount);

  return {
    startTime,
    endTime,
    durationHours,
    childrenCount,
    breakdown,
    baseRateForPricing,
    promoCodeId,
    promoDiscount,
    usePackage,
    carePointsHours,
    simPackageHours,
    simPackageCredit,
    simPackageSkills,
    simPointsHours,
    simPointsCost,
    simPointsDiscount,
    simFinalTotal,
    warnings,
  };
}

function summaryFromBooking(b: {
  totalAmount: Prisma.Decimal; subtotal: Prisma.Decimal; discountAmount: Prisma.Decimal;
  effectiveHourlyRate: Prisma.Decimal; durationHours: Prisma.Decimal; durationMultiplier: Prisma.Decimal;
  nannyAmount: Prisma.Decimal; platformAmount: Prisma.Decimal; packageHoursApplied: Prisma.Decimal;
  packageCreditAmount: Prisma.Decimal; rewardCreditHoursApplied: Prisma.Decimal; rewardCreditPoints: number;
  rewardCreditAmount: Prisma.Decimal;
}): BookingMoneySummary {
  return {
    totalAmount: num(b.totalAmount),
    subtotal: num(b.subtotal),
    discountAmount: num(b.discountAmount),
    effectiveHourlyRate: num(b.effectiveHourlyRate),
    durationHours: num(b.durationHours),
    durationMultiplier: num(b.durationMultiplier),
    nannyAmount: num(b.nannyAmount),
    platformAmount: num(b.platformAmount),
    packageHoursApplied: num(b.packageHoursApplied),
    packageCreditAmount: num(b.packageCreditAmount),
    rewardCreditHours: num(b.rewardCreditHoursApplied),
    rewardCreditPoints: b.rewardCreditPoints,
    rewardCreditAmount: num(b.rewardCreditAmount),
  };
}

function summaryFromPlan(plan: EditPlan): BookingMoneySummary {
  const discount = round2(plan.promoDiscount + plan.simPackageCredit + plan.simPointsDiscount);
  return {
    totalAmount: plan.simFinalTotal,
    subtotal: plan.breakdown.subtotal,
    discountAmount: discount,
    effectiveHourlyRate: plan.breakdown.effectiveHourlyRate,
    durationHours: plan.durationHours,
    durationMultiplier: plan.breakdown.durationMultiplier,
    nannyAmount: plan.breakdown.nannyAmount,
    platformAmount: round2(plan.breakdown.platformAmount - plan.simPackageCredit - plan.simPointsDiscount),
    packageHoursApplied: plan.simPackageHours,
    packageCreditAmount: plan.simPackageCredit,
    rewardCreditHours: plan.simPointsHours,
    rewardCreditPoints: plan.simPointsCost,
    rewardCreditAmount: plan.simPointsDiscount,
  };
}

async function loadEditBooking(id: number): Promise<EditBookingRow> {
  const booking = await prisma.booking.findFirst({ where: { id, deletedAt: null }, include: editInclude });
  if (!booking) throw errors.notFound('Booking not found');
  return booking;
}

/** Reject an edit if an unsettled top-up or a pending payment is already open. */
async function assertNoOpenObligation(db: Db, bookingId: number): Promise<void> {
  const openAdjustment = await db.bookingAdjustment.findFirst({
    where: { bookingId, status: 'PENDING_PAYMENT', deletedAt: null },
    select: { id: true },
  });
  if (openAdjustment) {
    throw errors.conflict('Settle or cancel the pending balance-due on this booking before editing it.');
  }
  const pendingPayment = await db.payment.findFirst({
    where: { bookingId, status: PaymentStatus.PENDING, deletedAt: null },
    select: { id: true },
  });
  if (pendingPayment) {
    throw errors.conflict('A payment is in progress on this booking. Wait for it to settle before editing.');
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Context for the admin editor's bounded inputs (GET /admin/bookings/:id/edit/context). */
export async function getBookingEditContext(id: number): Promise<AdminBookingEditContext> {
  const booking = await loadEditBooking(id);
  const [config, pricingInputs, rewardConfig, wallet, availableHours] = await Promise.all([
    getPlatformConfig(),
    getPricingInputs(),
    getRewardConfig(),
    getOrCreateWallet(booking.mother.id),
    getAvailableHours(booking.mother.id),
  ]);
  return {
    skillAddOns: pricingInputs.addOnSkills,
    includedChildrenPerBooking: config.includedChildrenPerBooking,
    maxChildrenPerBooking: config.maxChildrenPerBooking,
    minBookingHours: config.minBookingHours,
    maxBookingHours: config.maxBookingHours,
    bookingWindowStartHour: config.bookingWindowStartHour,
    bookingWindowEndHour: config.bookingWindowEndHour,
    carePoints: {
      pointsBalance: wallet.pointsBalance,
      redemptionPointsPerHour: rewardConfig.redemptionPointsPerHour,
      minRedemptionPoints: rewardConfig.minRedemptionPoints,
    },
    // Add back what this booking currently holds — that's spendable again on edit.
    availablePackageHours: round2(availableHours + num(booking.packageHoursApplied)),
  };
}

/** Dry-run re-price of a proposed edit — no writes (POST /admin/bookings/:id/edit/preview). */
export async function previewBookingEdit(
  id: number,
  adminFirebaseUid: string,
  input: AdminEditBookingInput,
): Promise<AdminEditPreviewResponse> {
  await resolveAdminId(adminFirebaseUid);
  const booking = await loadEditBooking(id);
  const plan = await buildEditPlan(prisma, booking, input);

  const amountPaid = sumCapturedPaid(booking.payments);
  const rawDelta = round2(plan.simFinalTotal - amountPaid);
  const delta = Math.abs(rawDelta) < 0.01 ? 0 : rawDelta;

  return {
    old: summaryFromBooking(booking as never),
    new: summaryFromPlan(plan),
    amountPaid,
    delta,
    refundableAmount: Math.max(0, round2(-delta)),
    balanceDueAmount: Math.max(0, round2(delta)),
    warnings: plan.warnings,
    revision: booking.updatedAt.toISOString(),
  };
}

/** Build a short "what changed" note for the mother's notification. */
function describeChanges(before: BookingMoneySummary, after: BookingMoneySummary): string {
  const parts: string[] = [];
  if (round2(before.durationHours) !== round2(after.durationHours)) {
    parts.push(`duration ${before.durationHours}h → ${after.durationHours}h`);
  }
  if (round2(before.totalAmount) !== round2(after.totalAmount)) {
    parts.push(`total ${money(before.totalAmount)} → ${money(after.totalAmount)}`);
  }
  return parts.length ? parts.join(', ') : 'booking details';
}

/** Commit an edit: re-validate, persist the new snapshot, settle credits, branch on the delta. */
export async function applyBookingEdit(
  id: number,
  adminFirebaseUid: string,
  input: AdminEditBookingCommitInput,
): Promise<{ booking: AdminBookingDetail; settlement: BookingSettlement }> {
  const adminId = await resolveAdminId(adminFirebaseUid);

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({ where: { id, deletedAt: null }, include: editInclude });
    if (!booking) throw errors.notFound('Booking not found');

    // Optimistic concurrency: reject a commit built against a stale preview.
    if (booking.updatedAt.toISOString() !== input.revision) {
      throw errors.conflict('This booking changed since you previewed it. Reload and try again.');
    }
    await assertNoOpenObligation(tx, id);

    const plan = await buildEditPlan(tx, booking, input);
    const blocking = plan.warnings.filter((w) => w.severity === 'block');
    if (blocking.length > 0) {
      throw errors.badRequest(blocking.map((w) => w.message).join(' '));
    }
    const softs = plan.warnings.filter((w) => w.severity === 'warn');
    if (softs.length > 0 && !input.acknowledgeSoftWarnings) {
      throw errors.badRequest(`Confirm these before saving: ${softs.map((w) => w.message).join(' ')}`);
    }

    const oldSummary = summaryFromBooking(booking as never);

    // Guarded touch FIRST (before any other write bumps updatedAt): confirms the
    // revision still matches atomically, and stamps the admin action.
    const guard = await tx.booking.updateMany({
      where: { id, updatedAt: booking.updatedAt, deletedAt: null },
      data: { adminActionById: adminId, adminActionAt: new Date() },
    });
    if (guard.count === 0) {
      throw errors.conflict('This booking changed while saving. Reload and try again.');
    }

    // Release the existing Care-Points redemption (points back to the wallet).
    if (booking.rewardCreditPoints > 0) {
      await refundBookingRedemption(tx, {
        userId: booking.mother.id,
        scope: { bookingId: id },
        points: booking.rewardCreditPoints,
      });
    }

    // Persist the new promo-only snapshot (credits are re-applied below).
    const bd = plan.breakdown;
    await tx.booking.update({
      where: { id },
      data: {
        startTime: plan.startTime,
        endTime: plan.endTime,
        date: toPlatformDateColumn(plan.startTime),
        durationHours: bd.durationHours,
        baseRate: plan.baseRateForPricing,
        effectiveHourlyRate: bd.effectiveHourlyRate,
        subtotal: bd.subtotal,
        durationMultiplier: bd.durationMultiplier,
        discountAmount: bd.discountAmount,
        serviceFeePercent: bd.serviceFeePercent,
        serviceFeeAmount: bd.serviceFeeAmount,
        totalAmount: bd.totalAmount,
        nannyAmount: bd.nannyAmount,
        platformAmount: bd.platformAmount,
        selectedSkillFees: bd.skillAddOns as unknown as Prisma.InputJsonValue,
        childrenCount: bd.childrenCount,
        extraChildren: bd.extraChildren,
        extraChildFeePerHour: bd.extraChildFeePerHour,
        bookedChildren: input.children as unknown as Prisma.InputJsonValue,
        promoCodeId: plan.promoCodeId,
        ...(input.latitude != null ? { latitude: input.latitude } : {}),
        ...(input.longitude != null ? { longitude: input.longitude } : {}),
        // Reset credit fields; re-applied in place below.
        rewardCreditHoursApplied: 0,
        rewardCreditPoints: 0,
        rewardCreditAmount: 0,
        packageHoursApplied: 0,
        packageSkillsCovered: 0,
        packageCreditAmount: 0,
      },
    });

    // Re-apply package hours in place (order: promo → package → points).
    const pkg = await reapplyPackageHoursForBooking(tx, {
      bookingId: id,
      userId: booking.mother.id,
      baseRate: plan.baseRateForPricing,
      durationMultiplier: bd.durationMultiplier,
      durationHours: bd.durationHours,
      totalAmountBeforePackage: bd.totalAmount,
      skillFeesPerHour: bd.skillAddOns.map((s) => s.amountPerHour),
      apply: plan.usePackage,
    });
    const afterPackageTotal = round2(bd.totalAmount - pkg.creditAmount);

    // Re-apply Care Points against the post-package total.
    let pointsHours = 0;
    let pointsCost = 0;
    let pointsDiscount = 0;
    if (plan.carePointsHours > 0) {
      const redemption = await applyBookingRedemption(tx, {
        userId: booking.mother.id,
        scope: { bookingId: id },
        redeemHours: plan.carePointsHours,
        perHour: bd.effectiveHourlyRate,
        durationHours: bd.durationHours,
      });
      pointsHours = redemption.hours;
      pointsCost = redemption.pointsCost;
      pointsDiscount = Math.min(redemption.discount, afterPackageTotal);
    }

    const finalTotal = round2(afterPackageTotal - pointsDiscount);
    const finalDiscount = round2(plan.promoDiscount + pkg.creditAmount + pointsDiscount);
    const finalPlatform = round2(bd.platformAmount - pkg.creditAmount - pointsDiscount);

    await tx.booking.update({
      where: { id },
      data: {
        discountAmount: finalDiscount,
        totalAmount: finalTotal,
        platformAmount: finalPlatform,
        packageHoursApplied: pkg.hoursApplied,
        packageSkillsCovered: pkg.skillsCovered,
        packageCreditAmount: pkg.creditAmount,
        rewardCreditHoursApplied: pointsHours,
        rewardCreditPoints: pointsCost,
        rewardCreditAmount: pointsDiscount,
      },
    });

    const amountPaid = sumCapturedPaid(booking.payments);
    const rawDelta = round2(finalTotal - amountPaid);
    const delta = Math.abs(rawDelta) < 0.01 ? 0 : rawDelta;

    const newSummary: BookingMoneySummary = {
      totalAmount: finalTotal,
      subtotal: bd.subtotal,
      discountAmount: finalDiscount,
      effectiveHourlyRate: bd.effectiveHourlyRate,
      durationHours: bd.durationHours,
      durationMultiplier: bd.durationMultiplier,
      nannyAmount: bd.nannyAmount,
      platformAmount: finalPlatform,
      packageHoursApplied: pkg.hoursApplied,
      packageCreditAmount: pkg.creditAmount,
      rewardCreditHours: pointsHours,
      rewardCreditPoints: pointsCost,
      rewardCreditAmount: pointsDiscount,
    };

    // Owes more AND has already paid → raise a balance-due obligation.
    let adjustmentId: number | null = null;
    if (delta > EPSILON && amountPaid > EPSILON) {
      const adj = await tx.bookingAdjustment.create({
        data: {
          bookingId: id,
          motherId: booking.mother.id,
          status: 'PENDING_PAYMENT',
          amountEgp: delta,
          reason: describeChanges(oldSummary, newSummary),
          createdById: adminId,
        },
      });
      adjustmentId = adj.id;
    }

    return {
      delta,
      amountPaid,
      adjustmentId,
      oldSummary,
      newSummary,
      motherId: booking.mother.id,
      nannyUserId: booking.nannyProfile?.user.id ?? null,
    };
  });

  // ── Notifications (after the tx commits) ──
  const changes = describeChanges(result.oldSummary, result.newSummary);
  await notifyBookingParty(
    result.motherId,
    NotificationType.BOOKING_EDITED,
    'booking_edited',
    'Your booking was updated',
    `Our team updated your booking (${changes}).`,
    id,
  );
  if (result.nannyUserId != null) {
    await notifyBookingParty(
      result.nannyUserId,
      NotificationType.BOOKING_EDITED,
      'booking_edited',
      'A booking was updated',
      `A booking you're assigned to was updated by our team (${changes}).`,
      id,
    );
  }
  if (result.adjustmentId != null) {
    await notifyBookingParty(
      result.motherId,
      NotificationType.BOOKING_BALANCE_DUE,
      'booking_balance_due',
      'A balance is due on your booking',
      `Your booking total went up. Please pay the difference of ${money(result.delta)} to keep it confirmed.`,
      id,
    );
  }

  const detail = await getAdminBooking(id);
  return {
    booking: detail,
    settlement: {
      delta: result.delta,
      amountPaid: result.amountPaid,
      refundableAmount: Math.max(0, round2(-result.delta)),
      balanceDueAmount: Math.max(0, round2(result.delta)),
      adjustmentId: result.adjustmentId,
    },
  };
}

/** Refund a booking overpayment as money (Paymob) or custom Care Points (POST .../refund). */
export async function refundBooking(
  id: number,
  adminFirebaseUid: string,
  input: AdminRefundBookingInput,
): Promise<AdminRefundResponse> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const booking = await loadEditBooking(id);

  const amountPaid = sumCapturedPaid(booking.payments);
  const refundable = round2(amountPaid - num(booking.totalAmount));
  if (refundable <= EPSILON) {
    throw errors.badRequest('There is no overpayment to refund on this booking.');
  }

  if (input.method === 'PAYMOB') {
    const amount = round2(input.amount ?? refundable);
    if (amount > refundable + EPSILON) {
      throw errors.badRequest(`The refund cannot exceed the overpaid amount (${money(refundable)}).`);
    }
    await refundBookingPayment({ bookingId: id, amountEgp: amount });
    await notifyBookingParty(
      booking.mother.id,
      NotificationType.BOOKING_REFUNDED,
      'booking_refunded',
      'You were refunded',
      `${money(amount)} was refunded to your card: ${input.reason}`,
      id,
    );
    const detail = await getAdminBooking(id);
    return { method: 'PAYMOB', refundedAmount: amount, grantedPoints: null, booking: detail };
  }

  // CARE_POINTS — admin-entered custom points (no fixed EGP→points conversion).
  const points = input.points!;
  await grantPoints({
    userId: booking.mother.id,
    points,
    reason: `Booking refund: ${input.reason}`,
    adminId,
  });
  await notifyBookingParty(
    booking.mother.id,
    NotificationType.BOOKING_REFUNDED,
    'booking_refunded',
    'You received Care Points',
    `${points} Care Points were added to your balance for a booking adjustment: ${input.reason}`,
    id,
  );
  const detail = await getAdminBooking(id);
  return { method: 'CARE_POINTS', refundedAmount: null, grantedPoints: points, booking: detail };
}
