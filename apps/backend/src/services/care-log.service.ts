import { Prisma } from '@prisma/client';
import {
  BookingStatus,
  CareLogType,
  Role,
  type CareLogResponse,
  type CreateCareLogRequest,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

type CareLogRow = Prisma.CareLogGetPayload<true>;

function toCareLogResponse(row: CareLogRow): CareLogResponse {
  return {
    id: row.id,
    bookingId: row.bookingId,
    nannyProfileId: row.nannyProfileId,
    type: row.type,
    customLabel: row.customLabel,
    notes: row.notes,
    occurredAt: row.occurredAt.toISOString(),
    evidenceUrls: row.evidenceUrls,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

/** Caller must be either the assigned nanny or the booking's mother. */
async function loadAuthorizedBooking(decoded: DecodedIdToken, bookingId: string) {
  const user = await getUserByUid(decoded.uid);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: { nannyProfile: true },
  });
  if (!booking) throw errors.notFound('Booking not found.');

  const isMother = booking.motherId === user.id;
  const isNanny = booking.nannyProfile?.userId === user.id;
  if (!isMother && !isNanny) throw errors.forbidden('Access denied.');

  return { user, booking, isMother, isNanny };
}

export async function listCareLogs(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<CareLogResponse[]> {
  await loadAuthorizedBooking(decoded, bookingId);
  const rows = await prisma.careLog.findMany({
    where: { bookingId, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
  });
  return rows.map(toCareLogResponse);
}

export async function createCareLog(
  decoded: DecodedIdToken,
  bookingId: string,
  body: CreateCareLogRequest,
): Promise<CareLogResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) {
    throw errors.forbidden('Only nannies can write to a care log.');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: { nannyProfile: true },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (!booking.nannyProfile || booking.nannyProfile.userId !== user.id) {
    throw errors.forbidden('You are not assigned to this booking.');
  }
  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.badRequest('Care log entries can only be added while the booking is in progress.');
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();

  const created = await prisma.careLog.create({
    data: {
      bookingId: booking.id,
      nannyProfileId: booking.nannyProfile.id,
      type: body.type,
      customLabel: body.type === CareLogType.CUSTOM ? body.customLabel ?? null : null,
      notes: body.notes ?? null,
      occurredAt,
      evidenceUrls: body.evidenceUrls,
    },
  });

  return toCareLogResponse(created);
}
