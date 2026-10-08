import { BookingStatus, NotificationType, PaymentStatus, Prisma } from '@prisma/client';

import { BookingAddressSchema, BookingChildSchema } from '@nanny-app/shared';
import type {
  BookingAddress,
  AdminBooking,
  AdminBookingDetail,
  AdminBookingListQuery,
  AdminBookingSortKey,
  AdminBookingStatusFilter,
  AdminSortDir,
  AppliedSkillFee,
  BookingChild,
  PaginationMeta,
  RejectAdminBookingInput,
  SetBookingStatusInput,
  UpdateBookingTimesInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { toPlatformDateColumn, toPlatformIso, wallClockToUtc } from '@backend/lib/platform-time';
import {
  assertNoConflict,
  assertNoPaymentInProgress,
  computeDurationHours,
  returnUnpaidCredits,
  validateStatusTransition,
} from '@backend/services/booking.service';
import { confirmBookingIfNothingOwed } from '@backend/services/paymob.service';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import { getPlatformConfig, getRevenueSplit } from '@backend/services/app-settings.service';
import { convertReferralForBooking } from '@backend/services/referral.service';
import { awardPointsForBooking } from '@backend/services/reward.service';
import { listActiveDurationRules } from '@backend/services/duration-rule.service';
import {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
} from '@backend/services/pricing.service';

export const bookingInclude = {
  mother: { select: { id: true, firstName: true, lastName: true, phone: true } },
  nannyProfile: {
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  // A booking has one payment row per attempt; the current one is the newest.
  payments: { select: { status: true }, orderBy: { id: 'desc' }, take: 1 },
  promoCode: { select: { code: true } },
} satisfies Prisma.BookingInclude;

export type AdminBookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/**
 * Wide include for the single-booking detail page: full parties + every
 * payment. The newest is the one the payment card shows; all of them feed the
 * overpayment figure, since a top-up is its own row.
 */
const bookingDetailInclude = {
  mother: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  nannyProfile: {
    select: {
      id: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
  },
  payments: { where: { deletedAt: null }, orderBy: { id: 'desc' } },
  promoCode: { select: { code: true } },
} satisfies Prisma.BookingInclude;

type AdminBookingDetailRow = Prisma.BookingGetPayload<{
  include: typeof bookingDetailInclude;
}>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sum of money the mother has actually paid and kept: captured minus refunded,
 * over every payment on the booking. The one figure the editor's delta, the
 * refund guard and the detail page all agree on.
 */
export function sumCapturedPaid(
  payments: { amount: Prisma.Decimal; refundedAmount: Prisma.Decimal; status: PaymentStatus }[],
): number {
  const paid = payments
    .filter((p) => p.status === PaymentStatus.CAPTURED || p.status === PaymentStatus.REFUNDED)
    .reduce((sum, p) => sum + (p.amount.toNumber() - p.refundedAmount.toNumber()), 0);
  return round2(paid);
}

export function parseSkillAddOns(raw: Prisma.JsonValue | null | undefined): AppliedSkillFee[] {
  return Array.isArray(raw) ? (raw as unknown as AppliedSkillFee[]) : [];
}

/** Validated, not cast — the column is null on pre-children bookings. */
function parseBookedChildren(raw: Prisma.JsonValue | null | undefined): BookingChild[] {
  if (!Array.isArray(raw)) return [];
  const parsed = BookingChildSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Same treatment for the address snapshot — null rather than a 500 on a bad row. */
function parseBookedAddress(raw: Prisma.JsonValue | null | undefined): BookingAddress | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = BookingAddressSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type CancellationPolicy = { cancellationWindowHours: number; cancellationFeePercent: number };

export type RefundPosition = {
  /** Why money is owed back: an edit lowered the price, or the booking was cancelled after payment. */
  kind: 'OVERPAID' | 'CANCELLED' | null;
  /** The most an admin may still give back, in EGP. */
  refundable: number;
  /** What the policy suggests — the console's starting point, never a promise to the mother. */
  suggested: number;
  /** The late-cancellation fee % kept in `suggested`, when one applies. */
  feePercent: number | null;
};

/**
 * What can still be refunded on a booking, and what the policy suggests.
 *
 * - Cancelled after paying: everything she paid and still has is refundable.
 *   The suggestion keeps the console's late-cancellation fee when she herself
 *   cancelled inside the window — the same rule cancelBooking quotes — and is
 *   the full amount otherwise (an admin cancelled it).
 * - Refunded: settled, nothing more.
 * - Anything else: only an overpayment (an edit lowered the price below what
 *   she paid) is refundable.
 *
 * The suggestion reads today's settings, not those at cancellation time.
 */
export function refundPosition(
  booking: {
    status: BookingStatus;
    totalAmount: Prisma.Decimal;
    motherId: number;
    cancelledById: number | null;
    cancelledAt: Date | null;
    startTime: Date;
  },
  amountPaid: number,
  policy: CancellationPolicy,
): RefundPosition {
  if (booking.status === BookingStatus.REFUNDED) {
    return { kind: null, refundable: 0, suggested: 0, feePercent: null };
  }

  if (booking.status === BookingStatus.CANCELLED) {
    const refundable = Math.max(0, round2(amountPaid));
    if (refundable <= 0) return { kind: null, refundable: 0, suggested: 0, feePercent: null };

    const cancelledAt = booking.cancelledAt ?? new Date();
    const hoursBeforeStart = (booking.startTime.getTime() - cancelledAt.getTime()) / 3_600_000;
    const lateByMother =
      booking.cancelledById === booking.motherId &&
      policy.cancellationWindowHours > 0 &&
      policy.cancellationFeePercent > 0 &&
      hoursBeforeStart <= policy.cancellationWindowHours;

    return lateByMother
      ? {
          kind: 'CANCELLED',
          refundable,
          suggested: round2(refundable * (1 - policy.cancellationFeePercent / 100)),
          feePercent: policy.cancellationFeePercent,
        }
      : { kind: 'CANCELLED', refundable, suggested: refundable, feePercent: null };
  }

  const overpaid = Math.max(0, round2(amountPaid - booking.totalAmount.toNumber()));
  return overpaid > 0
    ? { kind: 'OVERPAID', refundable: overpaid, suggested: overpaid, feePercent: null }
    : { kind: null, refundable: 0, suggested: 0, feePercent: null };
}

function toDetailDto(row: AdminBookingDetailRow, policy: CancellationPolicy): AdminBookingDetail {
  const payment = row.payments[0] ?? null;
  const amountPaid = sumCapturedPaid(row.payments);
  const refund = refundPosition(row, amountPaid, policy);
  const refundableAmount = refund.refundable;
  // Decided here, not in the browser: the admin's clock must not be what says
  // whether the code the parent is reading out is still good.
  const livePinExpiresAt =
    row.startPin != null &&
    row.startPinExpiresAt != null &&
    row.startPinExpiresAt.getTime() > Date.now()
      ? row.startPinExpiresAt
      : null;
  return {
    id: row.id,
    status: row.status,
    nannyDecision: row.nannyDecision,
    type: row.type,
    // A date-only column, so a date-only string — matching toBookingResponse.
    date: row.date.toISOString().slice(0, 10),
    // Platform wall-clock + offset. Every other timestamp on this payload is a
    // plain instant and correctly stays UTC — see the note in booking.service.ts.
    startTime: toPlatformIso(row.startTime),
    endTime: toPlatformIso(row.endTime),
    durationHours: row.durationHours.toNumber(),
    totalAmount: row.totalAmount.toNumber(),
    discountAmount: row.discountAmount.toNumber(),
    promoCode: row.promoCode?.code ?? null,
    paymentStatus: payment?.status ?? null,
    mother: {
      id: row.mother.id,
      name: `${row.mother.firstName} ${row.mother.lastName}`.trim(),
      email: row.mother.email,
      phone: row.mother.phone,
    },
    nanny: row.nannyProfile
      ? {
          id: row.nannyProfile.id,
          name: `${row.nannyProfile.user.firstName} ${row.nannyProfile.user.lastName}`.trim(),
          email: row.nannyProfile.user.email,
          phone: row.nannyProfile.user.phone,
        }
      : null,
    baseRate: row.baseRate.toNumber(),
    effectiveHourlyRate: row.effectiveHourlyRate.toNumber(),
    skillAddOns: parseSkillAddOns(row.selectedSkillFees),
    children: parseBookedChildren(row.bookedChildren),
    address: parseBookedAddress(row.bookedAddress),
    childrenCount: row.childrenCount,
    extraChildren: row.extraChildren,
    extraChildFeePerHour: row.extraChildFeePerHour.toNumber(),
    subtotal: row.subtotal.toNumber(),
    durationMultiplier: row.durationMultiplier.toNumber(),
    serviceFeePercent: row.serviceFeePercent.toNumber(),
    serviceFeeAmount: row.serviceFeeAmount.toNumber(),
    nannyAmount: row.nannyAmount.toNumber(),
    platformAmount: row.platformAmount.toNumber(),
    rewardCreditHours: row.rewardCreditHoursApplied.toNumber(),
    packageHoursApplied: row.packageHoursApplied.toNumber(),
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          amount: payment.amount.toNumber(),
          currency: payment.currency,
          paymobOrderId: payment.paymobOrderId,
          paymobTransactionId: payment.paymobTransactionId,
          paymobIntentionId: payment.paymobIntentionId,
          failureReason: payment.failureReason,
          refundedAmount: payment.refundedAmount.toNumber(),
          refundedAt: payment.refundedAt?.toISOString() ?? null,
        }
      : null,
    amountPaid,
    refundableAmount,
    refundKind: refund.kind,
    suggestedRefundAmount: refund.suggested,
    refundFeePercent: refund.feePercent,
    specialInstructions: row.specialInstructions,
    cancellationReason: row.cancellationReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    adminApprovedAt: row.adminApprovedAt?.toISOString() ?? null,
    nannyDecidedAt: row.nannyDecidedAt?.toISOString() ?? null,
    nannyCheckedInAt: row.nannyCheckedInAt?.toISOString() ?? null,
    nannyCheckedOutAt: row.nannyCheckedOutAt?.toISOString() ?? null,
    startPin: livePinExpiresAt ? row.startPin : null,
    startPinExpiresAt: livePinExpiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Loyalty points are not implemented yet — always null for now.
    pointsRedeemed: null,
  };
}

export function toDto(row: AdminBookingRow): AdminBooking {
  const payment = row.payments[0] ?? null;
  return {
    id: row.id,
    status: row.status,
    nannyDecision: row.nannyDecision,
    type: row.type,
    // A date-only column, so a date-only string — matching toBookingResponse.
    date: row.date.toISOString().slice(0, 10),
    // Platform wall-clock + offset. Every other timestamp on this payload is a
    // plain instant and correctly stays UTC — see the note in booking.service.ts.
    startTime: toPlatformIso(row.startTime),
    endTime: toPlatformIso(row.endTime),
    durationHours: row.durationHours.toNumber(),
    totalAmount: row.totalAmount.toNumber(),
    discountAmount: row.discountAmount.toNumber(),
    promoCode: row.promoCode?.code ?? null,
    paymentStatus: payment?.status ?? null,
    mother: {
      id: row.mother.id,
      name: `${row.mother.firstName} ${row.mother.lastName}`.trim(),
      phone: row.mother.phone,
    },
    nanny: row.nannyProfile
      ? {
          id: row.nannyProfile.id,
          name: `${row.nannyProfile.user.firstName} ${row.nannyProfile.user.lastName}`.trim(),
        }
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resolve the calling admin's internal user id from their Firebase uid. */
export async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
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

export async function notifyBookingParty(
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

export async function findAdminBooking(id: number): Promise<AdminBookingRow> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found');
  return booking;
}

/** Column sort → Prisma order for the admin Bookings list. */
function bookingOrderBy(
  sortBy: AdminBookingSortKey,
  sortDir: AdminSortDir,
): Prisma.BookingOrderByWithRelationInput[] {
  const orders: Record<AdminBookingSortKey, Prisma.BookingOrderByWithRelationInput[]> = {
    // The ID column: the id tiebreak below is the whole order.
    id: [],
    mother: [{ mother: { firstName: sortDir } }, { mother: { lastName: sortDir } }],
    // An unclaimed request has no nanny: Postgres puts it after every named
    // nanny A→Z and before them Z→A.
    nanny: [
      { nannyProfile: { user: { firstName: sortDir } } },
      { nannyProfile: { user: { lastName: sortDir } } },
    ],
    starts: [{ startTime: sortDir }],
    ends: [{ endTime: sortDir }],
    total: [{ totalAmount: sortDir }],
    // By code; bookings without one fall where `nanny`'s unclaimed ones do.
    promo: [{ promoCode: { code: sortDir } }],
    // Enum order: the booking lifecycle, PENDING → … → REFUNDED.
    status: [{ status: sortDir }],
    // The Waiting column is time since the request, so the longest wait is the
    // oldest request. Ascending — the shortest wait, newest first — is the
    // order the queue has always shown.
    waiting: [{ createdAt: sortDir === 'asc' ? 'desc' : 'asc' }],
  };
  // The id tiebreak keeps equal rows in a fixed order, so pages never overlap.
  return [...orders[sortBy], { id: sortDir }];
}

/**
 * Paginated admin Bookings list, filtered by status and sorted by whichever
 * column header the console last clicked (newest requests first by default).
 */
export async function listAdminBookings(
  status: AdminBookingStatusFilter,
  { page, limit, sortBy, sortDir }: Omit<AdminBookingListQuery, 'status'>,
): Promise<{ bookings: AdminBooking[]; meta: PaginationMeta }> {
  const where: Prisma.BookingWhereInput = {
    deletedAt: null,
    ...(status !== 'ALL' ? { status: status as BookingStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: bookingOrderBy(sortBy, sortDir),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    bookings: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Full detail for a single booking (admin detail page). */
export async function getAdminBooking(id: number): Promise<AdminBookingDetail> {
  const row = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    include: bookingDetailInclude,
  });
  if (!row) throw errors.notFound('Booking not found');
  return toDetailDto(row, await getPlatformConfig());
}

/**
 * Admin approves a booking request: PENDING → APPROVED. Authoritative — works
 * regardless of the nanny's decision (accepted, declined, or no response).
 * Stamps the approving admin, then prompts the mother to pay and informs the
 * nanny.
 */
export async function approveBooking(id: number, adminFirebaseUid: string): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const booking = await findAdminBooking(id);

  if (booking.status !== BookingStatus.PENDING) {
    throw errors.badRequest(
      `Only pending booking requests can be approved (current status: ${booking.status}).`,
    );
  }
  // A nanny must be assigned before approval — otherwise the booking becomes
  // unpayable (both payment paths reject a booking with no nanny) and no nanny
  // can claim it (claiming requires PENDING), trapping it in APPROVED forever.
  // This mirrors the invariant enforced by the payment paths.
  if (!booking.nannyProfileId) {
    throw errors.badRequest('Assign a nanny to this unclaimed request before approving it.');
  }
  validateStatusTransition(booking.status, BookingStatus.APPROVED);

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: BookingStatus.APPROVED,
      adminApprovedById: adminId,
      adminApprovedAt: new Date(),
    },
    include: bookingInclude,
  });

  // Nothing owed: confirmed on the spot, and both parties are told it's
  // confirmed instead of being asked for / waiting on a payment.
  if (await confirmBookingIfNothingOwed(id)) return toDto(await findAdminBooking(id));

  await notifyApprovedAwaitingPayment(updated);
  return toDto(updated);
}

/** Prompt the mother to pay an approved booking, and tell the nanny it's waiting on her. */
async function notifyApprovedAwaitingPayment(updated: AdminBookingRow): Promise<void> {
  const dateLabel = updated.date.toISOString().slice(0, 10);
  await notifyBookingParty(
    updated.mother.id,
    'BOOKING_APPROVED',
    'booking_approved',
    'Booking approved — complete payment',
    `Your booking for ${dateLabel} was approved. Pay now to confirm it.`,
    updated.id,
  );
  if (updated.nannyProfile) {
    await notifyBookingParty(
      updated.nannyProfile.user.id,
      'BOOKING_APPROVED',
      'booking_approved',
      'Booking approved',
      `A booking for ${dateLabel} was approved and is awaiting the parent's payment.`,
      updated.id,
    );
  }
}

/**
 * Admin rejects a booking request: → CANCELLED with an optional reason.
 * Notifies both parties.
 */
export async function rejectBooking(
  id: number,
  adminFirebaseUid: string,
  input: RejectAdminBookingInput,
): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  // Cancelling mid-checkout would leave her card charged for a cancelled
  // booking (see assertNoPaymentInProgress); a payment that already went
  // through has confirmed it, so read it after the check.
  await assertNoPaymentInProgress(id, 'The mother is paying for this booking right now. Try again in a few minutes.');
  const booking = await findAdminBooking(id);

  validateStatusTransition(booking.status, BookingStatus.CANCELLED);
  // Care Points and package hours spent on an unpaid request go back to her.
  await returnUnpaidCredits(booking);

  const reason = input.reason ?? 'Rejected by admin.';
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: BookingStatus.CANCELLED,
      cancellationReason: reason,
      cancelledById: adminId,
      cancelledAt: new Date(),
      adminActionById: adminId,
      adminActionAt: new Date(),
    },
    include: bookingInclude,
  });

  const dateLabel = updated.date.toISOString().slice(0, 10);
  await notifyBookingParty(
    updated.mother.id,
    'BOOKING_CANCELLED',
    'booking_cancelled',
    'Booking not approved',
    `Your booking for ${dateLabel} was not approved: ${reason}`,
    updated.id,
  );
  if (updated.nannyProfile) {
    await notifyBookingParty(
      updated.nannyProfile.user.id,
      'BOOKING_CANCELLED',
      'booking_cancelled',
      'Booking cancelled',
      `A booking for ${dateLabel} was cancelled by an admin.`,
      updated.id,
    );
  }

  return toDto(updated);
}

/**
 * Admin status override: change a booking to any valid target status. A
 * COMPLETED booking is locked and cannot be changed. All other changes must be
 * a valid transition (the transition table is the single source of truth) and
 * are recorded in the admin audit trail.
 */
export async function setBookingStatus(
  id: number,
  adminFirebaseUid: string,
  input: SetBookingStatusInput,
): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  if (input.status === BookingStatus.CANCELLED) {
    await assertNoPaymentInProgress(id, 'The mother is paying for this booking right now. Try again in a few minutes.');
  }
  const booking = await findAdminBooking(id);

  if (booking.status === BookingStatus.COMPLETED) {
    throw errors.badRequest('A completed booking is locked and cannot be changed.');
  }

  const next = input.status as BookingStatus;
  validateStatusTransition(booking.status, next);

  // Same invariant as approveBooking: never approve a booking with no nanny.
  if (next === BookingStatus.APPROVED && !booking.nannyProfileId) {
    throw errors.badRequest('Assign a nanny to this unclaimed request before approving it.');
  }

  if (next === BookingStatus.CANCELLED) await returnUnpaidCredits(booking);

  const now = new Date();
  const data: Prisma.BookingUpdateInput = {
    status: next,
    adminActionBy: { connect: { id: adminId } },
    adminActionAt: now,
  };
  if (next === BookingStatus.APPROVED) {
    data.adminApprovedBy = { connect: { id: adminId } };
    data.adminApprovedAt = now;
  }
  if (next === BookingStatus.CANCELLED) {
    data.cancellationReason = 'Status changed by admin.';
    data.cancelledBy = { connect: { id: adminId } };
    data.cancelledAt = now;
  }

  const updated = await prisma.booking.update({
    where: { id },
    data,
    include: bookingInclude,
  });

  if (next === BookingStatus.CANCELLED) {
    const dateLabel = updated.date.toISOString().slice(0, 10);
    await notifyBookingParty(
      updated.mother.id,
      'BOOKING_CANCELLED',
      'booking_cancelled',
      'Booking cancelled',
      `Your booking for ${dateLabel} was cancelled by an admin.`,
      updated.id,
    );
    if (updated.nannyProfile) {
      await notifyBookingParty(
        updated.nannyProfile.user.id,
        'BOOKING_CANCELLED',
        'booking_cancelled',
        'Booking cancelled',
        `A booking for ${dateLabel} was cancelled by an admin.`,
        updated.id,
      );
    }
  }

  if (next === BookingStatus.APPROVED) {
    if (await confirmBookingIfNothingOwed(id)) return toDto(await findAdminBooking(id));
    await notifyApprovedAwaitingPayment(updated);
  }

  // An admin force-completing a booking earns the parent Care Points too.
  // Best-effort + idempotent (mirrors the nanny checkout path).
  if (next === BookingStatus.COMPLETED) {
    try {
      await awardPointsForBooking({
        bookingId: updated.id,
        motherId: updated.mother.id,
        durationHours: updated.durationHours.toNumber(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rewards] failed to award points on admin completion', {
        bookingId: updated.id,
        err,
      });
    }

    // ...and pays out whoever referred them, if anyone did.
    try {
      await convertReferralForBooking({
        refereeUserId: updated.mother.id,
        bookingId: updated.id,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[referrals] failed to convert referral on admin completion', {
        bookingId: updated.id,
        err,
      });
    }
  }

  return toDto(updated);
}

/**
 * Admin edits a booking's scheduled window. Recomputes duration and the price
 * breakdown from the new window (using the booking's own captured baseRate,
 * service fee %, and any promo discount), guarding against a clash with the
 * assigned nanny's other bookings. Both parties are notified of the new time.
 * A COMPLETED or CANCELLED booking is locked.
 */
export async function updateBookingTimes(
  id: number,
  adminFirebaseUid: string,
  input: UpdateBookingTimesInput,
): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const booking = await findAdminBooking(id);

  if (
    booking.status === BookingStatus.COMPLETED ||
    booking.status === BookingStatus.CANCELLED ||
    booking.status === BookingStatus.REFUNDED
  ) {
    throw errors.badRequest(
      `A ${booking.status.toLowerCase()} booking is locked and its time cannot be changed.`,
    );
  }

  // Wall-clock in the platform timezone, same contract as the mobile create
  // flow — the admin's browser timezone must not decide what a time means.
  //
  // Deliberately NOT subject to the daily booking window or the minimum advance
  // notice: an admin fixing up a late-running or in-progress booking has to be
  // able to set times a parent couldn't have requested.
  const startTime = wallClockToUtc(input.startTime);
  const endTime = wallClockToUtc(input.endTime);
  if (startTime >= endTime) throw errors.badRequest('startTime must be before endTime.');

  const durationHours = computeDurationHours(startTime, endTime);
  if (durationHours < 1) throw errors.badRequest('Minimum booking duration is 1 hour.');
  if (durationHours > 12) throw errors.badRequest('Maximum booking duration is 12 hours.');

  // If a nanny has claimed it, keep her schedule collision-free.
  if (booking.nannyProfileId) {
    await assertNoConflict(booking.nannyProfileId, startTime, endTime, id);
  }

  // Re-price on the new duration using the per-hour rate already snapshotted on
  // the booking (base rate + selected skill add-ons + any extra-child fee), the
  // current duration tiers and revenue split. selectedSkillFees /
  // effectiveHourlyRate and the children columns are kept as-is — changing the
  // times doesn't change who the booking is for, and the child fee is already
  // inside this per-hour figure, so no children input is passed below.
  // Legacy bookings created before effectiveHourlyRate fall back to baseRate.
  const [split, durationRules] = await Promise.all([getRevenueSplit(), listActiveDurationRules()]);
  const perHour = booking.effectiveHourlyRate.toNumber() || booking.baseRate.toNumber();
  const durationMultiplier = resolveDurationMultiplier(durationHours, durationRules);
  const breakdown = calculatePriceBreakdown({
    baseRate: perHour,
    durationHours,
    durationMultiplier,
    discountAmount: booking.discountAmount.toNumber(),
    nannyPercent: split.nannyPercent,
    platformPercent: split.platformPercent,
  });

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      startTime,
      endTime,
      // Must move with startTime. Left stale, an admin rescheduling to another
      // day would hide the booking from the nanny's booked-slots lookup, which
      // queries on `date`.
      date: toPlatformDateColumn(startTime),
      durationHours: breakdown.durationHours,
      subtotal: breakdown.subtotal,
      durationMultiplier: breakdown.durationMultiplier,
      discountAmount: breakdown.discountAmount,
      serviceFeeAmount: breakdown.serviceFeeAmount,
      totalAmount: breakdown.totalAmount,
      nannyAmount: breakdown.nannyAmount,
      platformAmount: breakdown.platformAmount,
      adminActionBy: { connect: { id: adminId } },
      adminActionAt: new Date(),
    },
    include: bookingInclude,
  });

  const dateLabel = updated.date.toISOString().slice(0, 10);
  await notifyBookingParty(
    updated.mother.id,
    'BOOKING_CONFIRMED',
    'booking_updated',
    'Booking time updated',
    `The schedule for your ${dateLabel} booking was updated by our team.`,
    updated.id,
  );
  if (updated.nannyProfile) {
    await notifyBookingParty(
      updated.nannyProfile.user.id,
      'BOOKING_CONFIRMED',
      'booking_updated',
      'Booking time updated',
      `The schedule for a ${dateLabel} booking was updated by our team.`,
      updated.id,
    );
  }

  return toDto(updated);
}
