import { BookingStatus, NotificationType, Prisma } from '@prisma/client';

import type {
  AdminBooking,
  AdminBookingDetail,
  AdminBookingStatusFilter,
  AdminListQuery,
  AppliedSkillFee,
  PaginationMeta,
  RejectAdminBookingInput,
  SetBookingStatusInput,
  UpdateBookingTimesInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  toPlatformDateColumn,
  toPlatformIso,
  wallClockToUtc,
} from '@backend/lib/platform-time';
import {
  assertNoConflict,
  computeDurationHours,
  validateStatusTransition,
} from '@backend/services/booking.service';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import { getRevenueSplit } from '@backend/services/app-settings.service';
import { awardPointsForBooking } from '@backend/services/reward.service';
import { listActiveDurationRules } from '@backend/services/duration-rule.service';
import {
  calculatePriceBreakdown,
  resolveDurationMultiplier,
} from '@backend/services/pricing.service';

const bookingInclude = {
  mother: { select: { id: true, firstName: true, lastName: true, phone: true } },
  nannyProfile: {
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  payment: { select: { status: true } },
  promoCode: { select: { code: true } },
} satisfies Prisma.BookingInclude;

type AdminBookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

/** Wide include for the single-booking detail page: full parties + full payment. */
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
  payment: true,
  promoCode: { select: { code: true } },
} satisfies Prisma.BookingInclude;

type AdminBookingDetailRow = Prisma.BookingGetPayload<{
  include: typeof bookingDetailInclude;
}>;

function parseSkillAddOns(raw: Prisma.JsonValue | null | undefined): AppliedSkillFee[] {
  return Array.isArray(raw) ? (raw as unknown as AppliedSkillFee[]) : [];
}

function toDetailDto(row: AdminBookingDetailRow): AdminBookingDetail {
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
    paymentStatus: row.payment?.status ?? null,
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
    subtotal: row.subtotal.toNumber(),
    durationMultiplier: row.durationMultiplier.toNumber(),
    serviceFeePercent: row.serviceFeePercent.toNumber(),
    serviceFeeAmount: row.serviceFeeAmount.toNumber(),
    nannyAmount: row.nannyAmount.toNumber(),
    platformAmount: row.platformAmount.toNumber(),
    payment: row.payment
      ? {
          status: row.payment.status,
          method: row.payment.method,
          amount: row.payment.amount.toNumber(),
          currency: row.payment.currency,
          paymobOrderId: row.payment.paymobOrderId,
          paymobTransactionId: row.payment.paymobTransactionId,
          paymobIntentionId: row.payment.paymobIntentionId,
          failureReason: row.payment.failureReason,
          refundedAmount: row.payment.refundedAmount.toNumber(),
          refundedAt: row.payment.refundedAt?.toISOString() ?? null,
        }
      : null,
    specialInstructions: row.specialInstructions,
    cancellationReason: row.cancellationReason,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    adminApprovedAt: row.adminApprovedAt?.toISOString() ?? null,
    nannyDecidedAt: row.nannyDecidedAt?.toISOString() ?? null,
    nannyCheckedInAt: row.nannyCheckedInAt?.toISOString() ?? null,
    nannyCheckedOutAt: row.nannyCheckedOutAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    // Loyalty points are not implemented yet — always null for now.
    pointsRedeemed: null,
  };
}

function toDto(row: AdminBookingRow): AdminBooking {
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
    paymentStatus: row.payment?.status ?? null,
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
async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
  const admin = await prisma.user.findFirst({
    where: {
      firebaseUid: adminFirebaseUid,
      deletedAt: null,
      role: { in: ['ADMIN', 'SUPERUSER'] },
    },
    select: { id: true },
  });
  if (!admin) throw errors.forbidden('Admin access required');
  return admin.id;
}

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

async function findAdminBooking(id: number): Promise<AdminBookingRow> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found');
  return booking;
}

export async function listAdminBookings(
  status: AdminBookingStatusFilter,
  { page, limit }: AdminListQuery,
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
      orderBy: { createdAt: 'desc' },
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
  return toDetailDto(row);
}

/**
 * Admin approves a booking request: PENDING → APPROVED. Authoritative — works
 * regardless of the nanny's decision (accepted, declined, or no response).
 * Stamps the approving admin, then prompts the mother to pay and informs the
 * nanny.
 */
export async function approveBooking(
  id: number,
  adminFirebaseUid: string,
): Promise<AdminBooking> {
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
    throw errors.badRequest(
      'Assign a nanny to this unclaimed request before approving it.',
    );
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

  return toDto(updated);
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
  const booking = await findAdminBooking(id);

  validateStatusTransition(booking.status, BookingStatus.CANCELLED);

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
  const booking = await findAdminBooking(id);

  if (booking.status === BookingStatus.COMPLETED) {
    throw errors.badRequest('A completed booking is locked and cannot be changed.');
  }

  const next = input.status as BookingStatus;
  validateStatusTransition(booking.status, next);

  // Same invariant as approveBooking: never approve a booking with no nanny.
  if (next === BookingStatus.APPROVED && !booking.nannyProfileId) {
    throw errors.badRequest(
      'Assign a nanny to this unclaimed request before approving it.',
    );
  }

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
  // the booking (base rate + any selected skill add-ons), the current duration
  // tiers and revenue split. selectedSkillFees / effectiveHourlyRate are kept
  // as-is. Legacy bookings created before effectiveHourlyRate fall back to baseRate.
  const [split, durationRules] = await Promise.all([
    getRevenueSplit(),
    listActiveDurationRules(),
  ]);
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
