import { BookingStatus, NotificationType, Prisma } from '@prisma/client';

import type {
  AdminBooking,
  AdminBookingStatusFilter,
  RejectAdminBookingInput,
  SetBookingStatusInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { validateStatusTransition } from '@backend/services/booking.service';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const bookingInclude = {
  mother: { select: { id: true, firstName: true, lastName: true, phone: true } },
  nannyProfile: {
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  payment: { select: { status: true } },
} satisfies Prisma.BookingInclude;

type AdminBookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function toDto(row: AdminBookingRow): AdminBooking {
  return {
    id: row.id,
    status: row.status,
    nannyDecision: row.nannyDecision,
    type: row.type,
    date: row.date.toISOString(),
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationHours: row.durationHours.toNumber(),
    totalAmount: row.totalAmount.toNumber(),
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
async function resolveAdminId(adminFirebaseUid: string): Promise<string> {
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
  userId: string,
  type: NotificationType,
  pushType: string,
  title: string,
  body: string,
  bookingId: string,
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
    data: { type: pushType, bookingId, title },
  });
}

async function findAdminBooking(id: string): Promise<AdminBookingRow> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found');
  return booking;
}

export async function listAdminBookings(
  status: AdminBookingStatusFilter,
): Promise<AdminBooking[]> {
  const rows = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      ...(status !== 'ALL' ? { status: status as BookingStatus } : {}),
    },
    include: bookingInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toDto);
}

/**
 * Admin approves a booking request: PENDING → APPROVED. Authoritative — works
 * regardless of the nanny's decision (accepted, declined, or no response).
 * Stamps the approving admin, then prompts the mother to pay and informs the
 * nanny.
 */
export async function approveBooking(
  id: string,
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
      'Assign a nanny to this emergency request before approving it.',
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
  id: string,
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
  id: string,
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
      'Assign a nanny to this emergency request before approving it.',
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

  return toDto(updated);
}
