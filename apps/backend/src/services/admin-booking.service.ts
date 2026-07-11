import { BookingStatus, Prisma } from '@prisma/client';

import type { AdminBooking, AdminBookingStatusFilter } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
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
 * Admin accepts a paid booking: PENDING_CONFIRMATION → CONFIRMED,
 * then notifies the assigned nanny (in-app + push).
 */
export async function confirmAdminBooking(id: string): Promise<AdminBooking> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found');
  if (booking.status !== BookingStatus.PENDING_CONFIRMATION) {
    throw errors.badRequest(
      `Only bookings awaiting confirmation can be accepted (current status: ${booking.status}).`,
    );
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { status: BookingStatus.CONFIRMED },
    include: bookingInclude,
  });

  if (updated.nannyProfile) {
    const nannyUserId = updated.nannyProfile.user.id;
    const title = 'New confirmed booking';
    const body = `You have a confirmed booking on ${updated.date.toISOString().slice(0, 10)}.`;
    await createInAppNotification({
      userId: nannyUserId,
      type: 'BOOKING_CONFIRMED',
      title,
      body,
      referenceId: updated.id,
      referenceType: 'BOOKING',
    });
    await dispatchPush(nannyUserId, {
      title,
      body,
      data: { type: 'booking_confirmed', bookingId: updated.id, title },
    });
  }

  return toDto(updated);
}
