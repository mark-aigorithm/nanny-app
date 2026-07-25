import type { BookingAdjustmentResponse } from '@nanny-app/shared';
import type { BookingAdjustment } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

function toDto(row: BookingAdjustment): BookingAdjustmentResponse {
  return {
    id: row.id,
    bookingId: row.bookingId,
    status: row.status,
    amountEgp: row.amountEgp.toNumber(),
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

/**
 * The mother's open balance-due obligations on a booking (what she still owes
 * after an admin edit raised the total). Only her own, only unsettled ones —
 * the mobile app shows a "pay the difference" prompt for these.
 */
export async function listBookingAdjustments(
  decoded: DecodedIdToken,
  bookingId: number,
): Promise<BookingAdjustmentResponse[]> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { motherId: true },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');

  const rows = await prisma.bookingAdjustment.findMany({
    where: { bookingId, motherId: user.id, status: 'PENDING_PAYMENT', deletedAt: null },
    orderBy: { id: 'desc' },
  });
  return rows.map(toDto);
}
