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
import { distanceKm, isWithinRadius, toLatLng } from '@backend/lib/geo';
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
  validateStatusTransition,
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

  // Read-then-write, same as the nanny claim path: the conflict check runs
  // against what we just read, not inside the guarded write below, so two
  // concurrent assigns of one nanny to two overlapping bookings can both pass
  // this check and both win their own updateMany. A DB exclusion constraint
  // would close that gap for real; out of scope here.
  await assertNoConflict(nanny.id, booking.startTime, booking.endTime, id);

  const now = new Date();
  const approving = booking.status === BookingStatus.PENDING;
  if (approving) {
    // Parity with the nanny's own claim path (booking.service.ts), which
    // validates the same PENDING → APPROVED transition before its write.
    validateStatusTransition(booking.status, BookingStatus.APPROVED);
  }
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

/**
 * The nanny picker's rows for one booking: approved, live nannies (optionally
 * name-searched), each with the three verdicts an admin weighs before
 * choosing — a clash with her other bookings (refused on assign), the add-on
 * skills she lacks, and how far the job is from her home. The two soft ones use
 * the same helpers and settings as the broadcast, so the picker and the pool
 * agree on what "eligible" means.
 */
export async function listBookingCandidates(
  id: number,
  { q, limit }: AdminBookingCandidateQuery,
): Promise<AdminBookingCandidate[]> {
  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      nannyProfileId: true,
      startTime: true,
      endTime: true,
      latitude: true,
      longitude: true,
      selectedSkillFees: true,
    },
  });
  if (!booking) throw errors.notFound('Booking not found');

  const nameFilter: Prisma.UserWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};

  const [radiusKm, skillMatching, profiles] = await Promise.all([
    getBroadcastRadiusKm(),
    getSkillMatchingEnabled(),
    prisma.nannyProfile.findMany({
      where: {
        deletedAt: null,
        ...(booking.nannyProfileId ? { id: { not: booking.nannyProfileId } } : {}),
        user: { deletedAt: null, approvalStatus: ApprovalStatus.APPROVED, ...nameFilter },
      },
      select: {
        id: true,
        rating: true,
        reviewCount: true,
        user: {
          select: { firstName: true, lastName: true, phone: true, ...nannyHomeInclude },
        },
        nannySkills: { where: { deletedAt: null }, select: { skillId: true } },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      take: limit,
    }),
  ]);

  // One query for every clash, not one per nanny.
  const busy = new Set<number>();
  if (profiles.length > 0) {
    const clashes = await prisma.booking.findMany({
      where: {
        nannyProfileId: { in: profiles.map((p) => p.id) },
        id: { not: booking.id },
        deletedAt: null,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
        startTime: { lt: booking.endTime },
        endTime: { gt: booking.startTime },
      },
      select: { nannyProfileId: true },
    });
    for (const c of clashes) if (c.nannyProfileId !== null) busy.add(c.nannyProfileId);
  }

  const required = parseSkillAddOns(booking.selectedSkillFees);
  const bookingPoint = toLatLng(booking.latitude, booking.longitude);

  return profiles.map((p) => {
    const held = heldSkillIds(p.nannySkills);
    const home = nannyHomePoint(p.user);
    // Rounded only for display — the radius verdict below uses the raw
    // distance so the picker and the broadcast pool can't disagree at the
    // boundary (a distance that rounds to exactly the radius, say).
    const rawDistance = bookingPoint && home ? distanceKm(bookingPoint, home) : null;
    const distance = rawDistance !== null ? Math.round(rawDistance * 10) / 10 : null;
    return {
      id: p.id,
      name: `${p.user.firstName} ${p.user.lastName}`.trim(),
      phone: p.user.phone,
      rating: p.rating.toNumber(),
      reviewCount: p.reviewCount,
      conflict: busy.has(p.id),
      missingSkills: skillMatching
        ? required.filter((s) => !held.has(s.id)).map((s) => s.name)
        : [],
      distanceKm: distance,
      outsideRadius: !isWithinRadius(bookingPoint, home, radiusKm),
    };
  });
}
