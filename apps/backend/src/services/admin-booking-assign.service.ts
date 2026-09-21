import { ApprovalStatus, BookingStatus, NannyBookingDecision, Prisma } from '@prisma/client';

import { canAssignBookingNanny } from '@nanny-app/shared';
import type {
  AdminBooking,
  AdminBookingCandidate,
  AdminBookingCandidateQuery,
  AssignBookingNannyInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { distanceKm, toLatLng } from '@backend/lib/geo';
import {
  bookingInclude,
  findAdminBooking,
  notifyBookingParty,
  parseSkillAddOns,
  resolveAdminId,
  toDto,
} from '@backend/services/admin-booking.service';
import {
  getBroadcastRadiusKm,
  getSkillMatchingEnabled,
} from '@backend/services/app-settings.service';
import {
  assertNoConflict,
  heldSkillIds,
  nannyHomeInclude,
  nannyHomePoint,
} from '@backend/services/booking.service';

function statusLabel(status: BookingStatus): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

/**
 * Admin puts a nanny on a booking, or swaps the one it has.
 *
 * On an unclaimed PENDING request this is the console's counterpart to a
 * nanny's own claim: she is assigned AND the booking moves to APPROVED so the
 * mother is prompted to pay. On an APPROVED or CONFIRMED booking only the
 * nanny changes — the money split is a snapshot on the booking, not a property
 * of who delivers it. Anything later than CONFIRMED is locked.
 *
 * Skills and distance are the admin's call (the picker warns), but a nanny
 * can't be in two places and an unapproved one can't work, so those two are
 * refused here. The write is guarded on the status and nanny we read, the same
 * conditional-updateMany pattern the claim uses, so an assign racing a claim on
 * one PENDING request has exactly one winner.
 */
export async function assignBookingNanny(
  id: number,
  adminFirebaseUid: string,
  input: AssignBookingNannyInput,
): Promise<AdminBooking> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const booking = await findAdminBooking(id);

  if (!canAssignBookingNanny(booking.status)) {
    throw errors.badRequest(
      `This booking is ${statusLabel(booking.status)}; its nanny can no longer be changed.`,
    );
  }
  if (input.nannyProfileId === booking.nannyProfileId) {
    throw errors.badRequest('That nanny is already assigned to this booking.');
  }

  const nanny = await prisma.nannyProfile.findFirst({
    where: { id: input.nannyProfileId, deletedAt: null, user: { deletedAt: null } },
    select: {
      id: true,
      user: { select: { id: true, firstName: true, lastName: true, approvalStatus: true } },
    },
  });
  if (!nanny || nanny.user.approvalStatus !== ApprovalStatus.APPROVED) {
    throw errors.badRequest('Only an approved nanny can be assigned.');
  }

  await assertNoConflict(nanny.id, booking.startTime, booking.endTime, id);

  const now = new Date();
  const approving = booking.status === BookingStatus.PENDING;
  const written = await prisma.booking.updateMany({
    where: {
      id,
      deletedAt: null,
      status: booking.status,
      nannyProfileId: booking.nannyProfileId,
    },
    data: {
      nannyProfileId: nanny.id,
      // The new nanny hasn't answered; whatever the old one said is moot.
      nannyDecision: NannyBookingDecision.PENDING,
      nannyDecidedAt: null,
      adminActionById: adminId,
      adminActionAt: now,
      ...(approving
        ? { status: BookingStatus.APPROVED, adminApprovedById: adminId, adminApprovedAt: now }
        : {}),
    },
  });
  if (written.count === 0) {
    throw errors.conflict('This booking changed while you were editing it. Reload and try again.');
  }

  const updated = await prisma.booking.findUniqueOrThrow({
    where: { id },
    include: bookingInclude,
  });

  const dateLabel = updated.date.toISOString().slice(0, 10);
  const nannyName = `${nanny.user.firstName} ${nanny.user.lastName}`.trim();

  await notifyBookingParty(
    nanny.user.id,
    'BOOKING_APPROVED',
    'booking_approved',
    "You've been assigned a booking",
    `Our team assigned you a booking on ${dateLabel}.`,
    id,
  );
  if (booking.nannyProfile) {
    await notifyBookingParty(
      booking.nannyProfile.user.id,
      'BOOKING_CANCELLED',
      'booking_cancelled',
      'Booking reassigned',
      `You were removed from the ${dateLabel} booking by our team.`,
      id,
    );
  }
  if (approving) {
    await notifyBookingParty(
      updated.mother.id,
      'BOOKING_APPROVED',
      'booking_approved',
      'Booking approved — complete payment',
      `Your booking for ${dateLabel} was approved. Pay now to confirm it.`,
      id,
    );
  } else {
    await notifyBookingParty(
      updated.mother.id,
      'BOOKING_EDITED',
      'booking_edited',
      'Nanny changed',
      `Your nanny for ${dateLabel} is now ${nannyName}.`,
      id,
    );
  }

  return toDto(updated);
}

export async function listBookingCandidates(
  _id: number,
  _query: AdminBookingCandidateQuery,
): Promise<AdminBookingCandidate[]> {
  throw new Error('not implemented');
}
