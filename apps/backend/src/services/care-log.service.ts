import { Prisma } from '@prisma/client';
import {
  BookingStatus,
  CareLogType,
  Role,
  type CareLogResponse,
  type CreateCareLogRequest,
} from '@nanny-app/shared';
import {
  NotificationReferenceType,
  NotificationType,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

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

function careLogEntrySummary(type: CareLogType, customLabel: string | null): string {
  switch (type) {
    case CareLogType.MEAL:
      return 'logged a meal';
    case CareLogType.NAP:
      return 'logged nap time';
    case CareLogType.DIAPER:
      return 'logged a diaper change';
    case CareLogType.ACTIVITY:
      return 'logged an activity';
    case CareLogType.CUSTOM:
      return customLabel ? `logged: ${customLabel}` : 'added a care update';
    default:
      return 'added a care update';
  }
}

async function notifyMotherCareLogEntry(
  bookingId: string,
  motherId: string,
  nannyFirstName: string,
  nannyLastName: string,
  entryType: CareLogType,
  customLabel: string | null,
): Promise<void> {
  const nannyName = `${nannyFirstName} ${nannyLastName}`.trim();
  const title = 'New care log update';
  const body = `${nannyName} ${careLogEntrySummary(entryType, customLabel)}`;

  await createInAppNotification({
    userId: motherId,
    type: NotificationType.CARE_LOG_ENTRY,
    title,
    body,
    referenceId: bookingId,
    referenceType: NotificationReferenceType.BOOKING,
  });

  await dispatchPush(motherId, {
    title,
    body,
    data: {
      type: 'CARE_LOG_ENTRY',
      bookingId,
      focusCareLog: '1',
    },
  });
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
    include: { nannyProfile: { include: { user: true } } },
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

  void notifyMotherCareLogEntry(
    booking.id,
    booking.motherId,
    booking.nannyProfile.user.firstName,
    booking.nannyProfile.user.lastName,
    body.type,
    body.type === CareLogType.CUSTOM ? body.customLabel ?? null : null,
  ).catch(() => undefined);

  return toCareLogResponse(created);
}
