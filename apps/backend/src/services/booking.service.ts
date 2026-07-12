import { Prisma } from '@prisma/client';
import {
  BookingStatus,
  BookingType,
  PaymentStatus,
  type BookingListQuery,
  type BookingResponse,
  type CancelBookingRequest,
  type CreateBookingRequest,
  type CreateEmergencyBookingRequest,
  type EmergencyBookingResponse,
  isStandardBookingDateAllowed,
  STANDARD_BOOKING_SAME_DAY_MESSAGE,
  type MockPayBookingRequest,
  type NearbyNanny,
  type PaginationMeta,
  type PricingConfig,
  type ValidateBookingPromoRequest,
  type ValidateBookingPromoResponse,
} from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';
import {
  NannyApprovalStatus,
  NannyBookingDecision,
  NotificationReferenceType,
  NotificationType,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { getServiceFeePercent, getStandardHourlyRate } from './app-settings.service';
import { createInAppNotification, dispatchPush } from './notification.service';
import { calculatePriceBreakdown } from './pricing.service';
import { redeemPromoCode, validatePromoCode } from './promo-code.service';

/** Minutes before scheduled start when nanny may check in. */
export const CHECK_IN_EARLY_MINUTES = 15;

// ── Prisma include shape ──────────────────────────────────────────────────────

export const bookingInclude = {
  mother: true,
  nannyProfile: { include: { user: true } },
  payment: true,
  review: true,
} as const;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getUserByUid(uid: string) {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function toBookingResponse(b: BookingWithRelations): BookingResponse {
  return {
    id: b.id,
    motherId: b.motherId,
    motherFirstName: b.mother.firstName,
    motherLastName: b.mother.lastName,
    motherAvatarUrl: b.mother.avatarUrl,
    nannyProfileId: b.nannyProfileId,
    nanny: b.nannyProfile
      ? {
          nannyProfileId: b.nannyProfile.id,
          firstName: b.nannyProfile.user.firstName,
          lastName: b.nannyProfile.user.lastName,
          avatarUrl: b.nannyProfile.user.avatarUrl,
          hourlyRate: b.nannyProfile.hourlyRate !== null ? Number(b.nannyProfile.hourlyRate) : null,
          location: b.nannyProfile.user.address,
        }
      : null,
    status: b.status,
    nannyDecision: b.nannyDecision,
    nannyDecidedAt: b.nannyDecidedAt?.toISOString() ?? null,
    adminApprovedAt: b.adminApprovedAt?.toISOString() ?? null,
    type: b.type,
    date: b.date.toISOString().slice(0, 10),
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    durationHours: Number(b.durationHours),
    baseRate: Number(b.baseRate),
    subtotal: Number(b.subtotal),
    discountAmount: Number(b.discountAmount),
    serviceFeePercent: Number(b.serviceFeePercent),
    serviceFeeAmount: Number(b.serviceFeeAmount),
    totalAmount: Number(b.totalAmount),
    specialInstructions: b.specialInstructions,
    cancellationReason: b.cancellationReason,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    nannyCheckedInAt: b.nannyCheckedInAt?.toISOString() ?? null,
    nannyCheckedOutAt: b.nannyCheckedOutAt?.toISOString() ?? null,
    payment: b.payment
      ? {
          id: b.payment.id,
          status: b.payment.status,
          method: b.payment.method,
          amount: Number(b.payment.amount),
        }
      : null,
    myReview:
      b.review && !b.review.deletedAt
        ? {
            id: b.review.id,
            rating: b.review.rating,
            comment: b.review.comment,
            createdAt: b.review.createdAt.toISOString(),
          }
        : null,
    createdAt: b.createdAt.toISOString(),
  };
}

/**
 * Valid status transitions — the single source of truth for the booking
 * lifecycle. Pay-after-approval flow (Issues 2 + 5):
 *   PENDING → APPROVED (admin) → CONFIRMED (mother pays) → IN_PROGRESS → COMPLETED
 * Any non-terminal status may be CANCELLED. PENDING_CONFIRMATION is retained
 * only so legacy rows created by the old "pay-then-confirm" flow can still be
 * confirmed or cancelled; the new flow never produces it. REFUNDED is a
 * terminal state owned by the payments domain and is not reachable here.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]:              [BookingStatus.APPROVED, BookingStatus.CANCELLED],
  [BookingStatus.APPROVED]:             [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.PENDING_CONFIRMATION]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]:            [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]:          [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.COMPLETED]:            [],
  [BookingStatus.CANCELLED]:            [],
  [BookingStatus.REFUNDED]:             [],
};

/** Non-throwing transition check — reads the same table as validateStatusTransition. */
export function canTransitionBookingStatus(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

export function validateStatusTransition(current: string, next: string): void {
  if (!canTransitionBookingStatus(current, next)) {
    throw errors.badRequest(`Cannot transition booking from ${current} to ${next}.`);
  }
}

export function computeDurationHours(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function buildListOrderBy(
  query: BookingListQuery,
): Prisma.BookingOrderByWithRelationInput {
  const field =
    query.sortBy === 'createdAt'
      ? 'createdAt'
      : query.sortBy === 'startTime'
        ? 'startTime'
        : 'date';
  return { [field]: query.sortDir };
}

async function notifyMotherBookingEvent(
  booking: BookingWithRelations,
  type: 'NANNY_CHECKIN' | 'BOOKING_COMPLETED',
  title: string,
  body: string,
): Promise<void> {
  await createInAppNotification({
    userId: booking.motherId,
    type: type as NotificationType,
    title,
    body,
    referenceId: booking.id,
    referenceType: 'BOOKING' as NotificationReferenceType,
  });

  await dispatchPush(booking.motherId, {
    title,
    body,
    data: {
      type,
      bookingId: booking.id,
      title,
    },
  });
}

async function notifyUserBookingEvent(
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
    referenceType: 'BOOKING' as NotificationReferenceType,
  });
  await dispatchPush(userId, {
    title,
    body,
    data: { type: pushType, bookingId, title },
  });
}

/**
 * Broadcast a new, unclaimed booking request to every eligible nanny and to
 * every admin at once. No nanny is assigned yet — the request is offered to the
 * whole pool and the first nanny to accept claims it. "Eligible" means an
 * approved nanny with a complete profile who is free for the requested window.
 * No payment has been taken; the mother pays once a nanny claims the request.
 */
async function notifyBookingBroadcast(booking: BookingWithRelations): Promise<void> {
  const dateLabel = booking.date.toISOString().slice(0, 10);

  const nannies = await prisma.nannyProfile.findMany({
    where: {
      deletedAt: null,
      isProfileComplete: true,
      approvalStatus: NannyApprovalStatus.APPROVED,
      // Exclude nannies already booked for an overlapping window — they can't
      // take this one anyway.
      bookings: {
        none: {
          deletedAt: null,
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
          startTime: { lt: booking.endTime },
          endTime: { gt: booking.startTime },
        },
      },
    },
    select: { userId: true },
  });

  const admins = await prisma.user.findMany({
    where: { deletedAt: null, role: { in: ['ADMIN', 'SUPERUSER'] } },
    select: { id: true },
  });

  const recipients: Array<{ userId: string; title: string; body: string }> = [
    ...nannies.map((n) => ({
      userId: n.userId,
      title: 'New care request',
      body: `A parent needs care on ${dateLabel}. Accept to claim it — first to accept gets the booking.`,
    })),
    ...admins.map((a) => ({
      userId: a.id,
      title: 'New booking request',
      body: `A new booking request for ${dateLabel} was created.`,
    })),
  ];

  await Promise.all(
    recipients.map((r) =>
      notifyUserBookingEvent(
        r.userId,
        'BOOKING_REQUESTED' as NotificationType,
        'booking_requested',
        r.title,
        r.body,
        booking.id,
      ),
    ),
  );
}

/**
 * Tell the mother a nanny has claimed her request and payment is now due. This
 * is the moment the mother is prompted to pay — the claim moved the booking to
 * APPROVED (payable). Reuses the BOOKING_APPROVED notification type.
 */
async function notifyMotherNannyClaimed(booking: BookingWithRelations): Promise<void> {
  const dateLabel = booking.date.toISOString().slice(0, 10);
  await notifyUserBookingEvent(
    booking.motherId,
    'BOOKING_APPROVED' as NotificationType,
    'booking_approved',
    'A nanny accepted your request',
    `A nanny is ready for your ${dateLabel} booking. Complete payment to confirm it.`,
    booking.id,
  );
}

/** Notify the assigned nanny that a booking is fully confirmed (post-payment). */
export async function notifyNannyBookingConfirmed(
  booking: BookingWithRelations,
): Promise<void> {
  if (!booking.nannyProfile) return;
  await notifyUserBookingEvent(
    booking.nannyProfile.user.id,
    'BOOKING_CONFIRMED' as NotificationType,
    'booking_confirmed',
    'New confirmed booking',
    `You have a confirmed booking on ${booking.date.toISOString().slice(0, 10)}.`,
    booking.id,
  );
}

export async function assertNoConflict(
  nannyProfileId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string,
): Promise<void> {
  const conflict = await prisma.booking.findFirst({
    where: {
      nannyProfileId,
      deletedAt: null,
      status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: {
      id: true,
      motherId: true,
      status: true,
      startTime: true,
      endTime: true,
    },
  });
  if (conflict) {
    // eslint-disable-next-line no-console
    console.warn('[booking] slot conflict', {
      nannyProfileId,
      requestedStart: startTime.toISOString(),
      requestedEnd: endTime.toISOString(),
      excludeBookingId: excludeBookingId ?? null,
      existingBookingId: conflict.id,
      existingMotherId: conflict.motherId,
      existingStatus: conflict.status,
      existingStart: conflict.startTime.toISOString(),
      existingEnd: conflict.endTime.toISOString(),
    });
    throw errors.conflict('This nanny is already booked for the requested time slot.');
  }
}

// ── Public service functions ──────────────────────────────────────────────────

/**
 * Create a booking request — the primary "broadcast" flow. The mother does NOT
 * pick a nanny: the request is created unassigned (nannyProfileId = null) and
 * broadcast to every eligible nanny, and the first to accept claims it
 * (applyNannyDecision). Unlike the emergency track, the price is known up front
 * because it uses the FIXED platform hourly rate, so the mother sees her total
 * immediately. The nanny time-conflict check happens at claim time, not here.
 */
export async function createBooking(
  decoded: DecodedIdToken,
  body: CreateBookingRequest,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can create bookings.');

  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  if (startTime >= endTime) throw errors.badRequest('startTime must be before endTime.');
  if (startTime < new Date()) throw errors.badRequest('Cannot book in the past.');
  if (!isStandardBookingDateAllowed(body.date)) {
    throw errors.badRequest(STANDARD_BOOKING_SAME_DAY_MESSAGE);
  }

  const durationHours = computeDurationHours(startTime, endTime);
  if (durationHours < 1) throw errors.badRequest('Minimum booking duration is 1 hour.');
  if (durationHours > 12) throw errors.badRequest('Maximum booking duration is 12 hours.');

  // Idempotency: a double-tapped "Request care" must not create two broadcasts.
  // Reuse an existing unclaimed request for the same mother and time window.
  const existingPending = await prisma.booking.findFirst({
    where: {
      motherId: user.id,
      nannyProfileId: null,
      deletedAt: null,
      status: BookingStatus.PENDING,
      type: BookingType.STANDARD,
      startTime,
      endTime,
    },
    include: bookingInclude,
  });
  if (existingPending) {
    // eslint-disable-next-line no-console
    console.info('[booking] reusing pending broadcast request for retry', {
      bookingId: existingPending.id,
      motherId: user.id,
    });
    return toBookingResponse(existingPending);
  }

  const serviceFeePercent = await getServiceFeePercent();
  const hourlyRate = await getStandardHourlyRate();

  let promoCodeId: string | null = null;
  let discountAmount = 0;
  if (body.promoCode) {
    const subtotal = hourlyRate * durationHours;
    const serviceFeeAmount = subtotal * (serviceFeePercent / 100);
    const grossTotal = subtotal + serviceFeeAmount;
    const validated = await validatePromoCode(body.promoCode, grossTotal, user.id);
    promoCodeId = validated.promoCodeId;
    discountAmount = validated.discountAmount;
  }

  const breakdown = calculatePriceBreakdown({
    baseRate: hourlyRate,
    durationHours,
    discountAmount,
    serviceFeePercent,
  });

  const data: Prisma.BookingUncheckedCreateInput = {
    motherId: user.id,
    nannyProfileId: null,
    status: BookingStatus.PENDING,
    type: BookingType.STANDARD,
    date: new Date(body.date),
    startTime,
    endTime,
    durationHours: breakdown.durationHours,
    baseRate: breakdown.baseRate,
    subtotal: breakdown.subtotal,
    discountAmount: breakdown.discountAmount,
    serviceFeePercent: breakdown.serviceFeePercent,
    serviceFeeAmount: breakdown.serviceFeeAmount,
    totalAmount: breakdown.totalAmount,
    ...(promoCodeId ? { promoCodeId } : {}),
    ...(body.specialInstructions ? { specialInstructions: body.specialInstructions } : {}),
  };

  let booking: BookingWithRelations;
  if (promoCodeId) {
    const appliedPromoCodeId = promoCodeId;
    booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({ data, include: bookingInclude });
      await redeemPromoCode(tx, {
        promoCodeId: appliedPromoCodeId,
        userId: user.id,
        bookingId: created.id,
      });
      return created;
    });
  } else {
    booking = await prisma.booking.create({ data, include: bookingInclude });
  }

  await notifyBookingBroadcast(booking);

  return toBookingResponse(booking);
}

/**
 * Preview a promo discount for a mother before booking. Reads only — never
 * consumes the code or writes a redemption. The client sends the base subtotal
 * (rate × hours); the server adds the service fee so fee logic stays server-side.
 */
/**
 * Public pricing inputs for the booking form's live estimate: the fixed
 * platform hourly rate and the service fee %. Any authenticated user may read
 * these (they're not secret) so the mother sees her total before requesting.
 */
export async function getBookingPricingConfig(): Promise<PricingConfig> {
  const [standardHourlyRate, serviceFeePercent] = await Promise.all([
    getStandardHourlyRate(),
    getServiceFeePercent(),
  ]);
  return { standardHourlyRate, serviceFeePercent };
}

export async function validateBookingPromo(
  decoded: DecodedIdToken,
  body: ValidateBookingPromoRequest,
): Promise<ValidateBookingPromoResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can apply promo codes.');

  const serviceFeePercent = await getServiceFeePercent();
  const grossTotal = body.subtotal + body.subtotal * (serviceFeePercent / 100);
  const { discountAmount } = await validatePromoCode(body.code, grossTotal, user.id);
  return { discountAmount };
}

/**
 * EMERGENCY BOOKING FLOW — same-day care with no pre-selected nanny.
 *
 * Standard bookings require choosing a specific nanny and must be scheduled at
 * least a day ahead (see isStandardBookingDateAllowed). The emergency track
 * covers same-day needs where the mother can't wait to browse and pick: the
 * request is broadcast, and the first eligible nanny to accept "claims" it.
 *
 * End-to-end lifecycle:
 *
 *   1. MOTHER creates the request (this function). No nanny is assigned
 *      (nannyProfileId = null) and no price is known yet, so every money field
 *      is created as 0. Status starts at PENDING. Admins are notified; the
 *      response also hands the mother the 5 nearest available nannies so the
 *      app can show who might pick it up.
 *
 *   2. NANNY claims it (applyNannyDecision, ACCEPTED branch). The first nanny to
 *      accept is assigned to the booking AND the booking is (re)priced at HER
 *      hourly rate — the price is not known until this moment. A transaction +
 *      status re-check prevents two nannies claiming the same request at once.
 *      The booking stays PENDING: claiming is not approval.
 *
 *   3. ADMIN approves (admin-booking.service). Approval is authoritative, but an
 *      emergency request cannot be approved while unclaimed — a nanny must be
 *      assigned first. Approval moves it to APPROVED, then the mother pays and
 *      it becomes CONFIRMED, identical to the standard track from here on.
 *
 * This function is step 1 (the mother's side).
 */
export async function createEmergencyBooking(
  decoded: DecodedIdToken,
  body: CreateEmergencyBookingRequest,
): Promise<EmergencyBookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can create bookings.');

  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  if (startTime >= endTime) throw errors.badRequest('startTime must be before endTime.');

  const durationHours = computeDurationHours(startTime, endTime);
  if (durationHours < 1) throw errors.badRequest('Minimum booking duration is 1 hour.');
  if (durationHours > 12) throw errors.badRequest('Maximum booking duration is 12 hours.');

  const serviceFeePercent = await getServiceFeePercent();

  const booking = await prisma.booking.create({
    data: {
      motherId: user.id,
      nannyProfileId: null,
      status: BookingStatus.PENDING,
      type: BookingType.EMERGENCY,
      date: new Date(body.date),
      startTime,
      endTime,
      durationHours,
      baseRate: 0,
      subtotal: 0,
      discountAmount: 0,
      serviceFeePercent,
      serviceFeeAmount: 0,
      totalAmount: 0,
    },
    include: bookingInclude,
  });

  // Broadcast the unclaimed request to every eligible nanny (and the admins);
  // the first to accept claims and prices it.
  await notifyBookingBroadcast(booking);

  // Find 5 nearest available nannies. Coordinates + address live on the user
  // row (single source of truth); distance is computed in PostGIS
  // (ST_DistanceSphere → metres, converted to km) for consistency with the
  // recommended-nanny listing. `ST_MakePoint(lon, lat)` order is required.
  type RawRow = {
    nannyProfileId: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    hourlyRate: string | null;
    location: string | null;
    ageRanges: string[] | string;
    yearsOfExperience: number | null;
    distanceKm: number;
  };

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      np.id                                AS "nannyProfileId",
      u.first_name                         AS "firstName",
      u.last_name                          AS "lastName",
      u.avatar_url                         AS "avatarUrl",
      np.hourly_rate::text                 AS "hourlyRate",
      u.address                            AS "location",
      np.age_ranges                        AS "ageRanges",
      np.years_of_experience               AS "yearsOfExperience",
      (
        ST_DistanceSphere(
          ST_MakePoint(u.longitude::float8, u.latitude::float8),
          ST_MakePoint(${body.longitude}::float8, ${body.latitude}::float8)
        ) / 1000
      ) AS "distanceKm"
    FROM nanny_profiles np
    JOIN users u ON u.id = np.user_id
    WHERE np.deleted_at IS NULL
      AND u.deleted_at   IS NULL
      AND u.latitude     IS NOT NULL
      AND u.longitude    IS NOT NULL
      AND np.is_profile_complete = true
      AND np.approval_status::text = 'APPROVED'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.nanny_profile_id = np.id
          AND b.deleted_at IS NULL
          AND b.status NOT IN ('CANCELLED', 'REFUNDED')
          AND b.start_time < ${endTime}
          AND b.end_time   > ${startTime}
      )
    ORDER BY "distanceKm" ASC
    LIMIT 5
  `);

  const nearbyNannies: NearbyNanny[] = rows.map((r) => ({
    nannyProfileId: r.nannyProfileId,
    firstName: r.firstName,
    lastName: r.lastName,
    avatarUrl: r.avatarUrl,
    hourlyRate: r.hourlyRate !== null ? parseFloat(r.hourlyRate) : null,
    location: r.location,
    distanceKm: Number(r.distanceKm),
    ageRanges: Array.isArray(r.ageRanges) ? r.ageRanges : [],
    yearsOfExperience: r.yearsOfExperience,
  }));

  return { booking: toBookingResponse(booking), nearbyNannies };
}

export async function listBookings(
  decoded: DecodedIdToken,
  query: BookingListQuery,
): Promise<{ bookings: BookingResponse[]; meta: PaginationMeta }> {
  const user = await getUserByUid(decoded.uid);

  const statuses = query.status
    ? query.status.split(',').filter((s) =>
        Object.values(BookingStatus).includes(s as typeof BookingStatus[keyof typeof BookingStatus]),
      )
    : undefined;

  const where: Prisma.BookingWhereInput = {
    deletedAt: null,
    ...(statuses?.length ? { status: { in: statuses as never[] } } : {}),
    ...(user.role === Role.NANNY
      ? { nannyProfile: { userId: user.id } }
      : { motherId: user.id }),
  };

  const [total, bookings] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: buildListOrderBy(query),
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    bookings: bookings.map(toBookingResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * The open broadcast pool a nanny can claim: unassigned PENDING requests that
 * start in the future and don't overlap any booking the nanny already holds.
 * Soonest-starting first. Any nanny may claim any of these (first to accept
 * wins), so this is intentionally not distance-filtered.
 */
export async function listAvailableBookings(
  decoded: DecodedIdToken,
): Promise<BookingResponse[]> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) {
    throw errors.forbidden('Only nannies can view available requests.');
  }

  const nannyProfile = await prisma.nannyProfile.findUnique({
    where: { userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!nannyProfile) throw errors.notFound('Nanny profile not found.');

  const [busy, open] = await Promise.all([
    prisma.booking.findMany({
      where: {
        nannyProfileId: nannyProfile.id,
        deletedAt: null,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.REFUNDED] },
      },
      select: { startTime: true, endTime: true },
    }),
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        status: BookingStatus.PENDING,
        nannyProfileId: null,
        startTime: { gt: new Date() },
      },
      include: bookingInclude,
      orderBy: { startTime: 'asc' },
      take: 50,
    }),
  ]);

  const available = open.filter(
    (b) => !busy.some((slot) => slot.startTime < b.endTime && slot.endTime > b.startTime),
  );

  return available.map(toBookingResponse);
}

export async function getBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');

  const isOwner =
    booking.motherId === user.id ||
    (booking.nannyProfile?.userId === user.id);
  if (!isOwner) throw errors.forbidden('Access denied.');

  return toBookingResponse(booking);
}

export async function cancelBooking(
  decoded: DecodedIdToken,
  bookingId: string,
  body: CancelBookingRequest,
): Promise<{ booking: BookingResponse; refundAmount: number }> {
  const user = await getUserByUid(decoded.uid);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');

  const isMother = booking.motherId === user.id;
  const isNanny = booking.nannyProfile?.userId === user.id;
  if (!isMother && !isNanny) throw errors.forbidden('Access denied.');

  validateStatusTransition(booking.status, BookingStatus.CANCELLED);

  const hoursUntilStart = (booking.startTime.getTime() - Date.now()) / 3_600_000;
  // Full refund if > 24 hrs out or nanny cancels; 50 % otherwise.
  const refundAmount =
    isNanny || hoursUntilStart > 24
      ? Number(booking.totalAmount)
      : Math.round(Number(booking.totalAmount) * 0.5 * 100) / 100;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CANCELLED,
      cancellationReason: body.reason,
      cancelledById: user.id,
      cancelledAt: new Date(),
    },
    include: bookingInclude,
  });

  return { booking: toBookingResponse(updated), refundAmount };
}

/**
 * Nanny responds to a booking request.
 *
 * For an UNCLAIMED request (nannyProfileId = null, either STANDARD or
 * EMERGENCY), ACCEPT *claims* it: the nanny is assigned and the booking moves
 * PENDING → APPROVED so it becomes payable immediately — there is no admin
 * approval gate. First to accept wins; a transaction + status re-check prevents
 * two nannies claiming the same request. You can't decline an unclaimed request
 * (it isn't yours) — you simply don't claim it. Emergency requests are re-priced
 * at the claiming nanny's rate (their price is unknown until a nanny claims);
 * standard requests keep the fixed platform price they were created with.
 *
 * For a request already ASSIGNED to this nanny, accept/decline just records
 * nannyDecision + nannyDecidedAt (informational).
 */
async function applyNannyDecision(
  decoded: DecodedIdToken,
  bookingId: string,
  decision: 'ACCEPTED' | 'DECLINED',
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies can respond to bookings.');

  const nannyProfile = await prisma.nannyProfile.findUnique({
    where: { userId: user.id, deletedAt: null },
  });
  if (!nannyProfile) throw errors.notFound('Nanny profile not found.');

  const decisionValue =
    decision === 'ACCEPTED' ? NannyBookingDecision.ACCEPTED : NannyBookingDecision.DECLINED;

  let claimed = false;

  // Serializable-ish: read-then-update in a transaction to guard against
  // two nannies claiming the same request simultaneously.
  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId, deletedAt: null },
    });
    if (!booking) throw errors.notFound('Booking not found.');
    if (booking.status !== BookingStatus.PENDING) {
      throw errors.badRequest('This booking is no longer awaiting a nanny decision.');
    }

    // Unclaimed request: ACCEPT claims it and makes it payable (→ APPROVED).
    if (booking.nannyProfileId === null) {
      if (decision === 'DECLINED') {
        throw errors.badRequest('This booking is not assigned to you.');
      }

      await assertNoConflict(nannyProfile.id, booking.startTime, booking.endTime);

      // Emergency requests carry no price until claimed — re-price at the
      // claiming nanny's rate. Standard requests keep their fixed platform price.
      let repriceData: Prisma.BookingUpdateInput = {};
      if (booking.type === BookingType.EMERGENCY) {
        if (!nannyProfile.hourlyRate) {
          throw errors.badRequest('Set your hourly rate before claiming emergency requests.');
        }
        const serviceFeePercent = await getServiceFeePercent();
        const breakdown = calculatePriceBreakdown({
          baseRate: Number(nannyProfile.hourlyRate),
          durationHours: Number(booking.durationHours),
          serviceFeePercent,
        });
        repriceData = {
          baseRate: breakdown.baseRate,
          subtotal: breakdown.subtotal,
          serviceFeePercent: breakdown.serviceFeePercent,
          serviceFeeAmount: breakdown.serviceFeeAmount,
          totalAmount: breakdown.totalAmount,
        };
      }

      validateStatusTransition(booking.status, BookingStatus.APPROVED);
      claimed = true;

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          ...repriceData,
          nannyProfile: { connect: { id: nannyProfile.id } },
          status: BookingStatus.APPROVED,
          nannyDecision: decisionValue,
          nannyDecidedAt: new Date(),
        },
        include: bookingInclude,
      });
    }

    // Assigned booking (an emergency already claimed by this nanny, or a booking
    // routed to her): record the informational decision only.
    if (booking.nannyProfileId !== nannyProfile.id) {
      throw errors.forbidden('This booking is not assigned to you.');
    }
    return tx.booking.update({
      where: { id: bookingId },
      data: {
        nannyDecision: decisionValue,
        nannyDecidedAt: new Date(),
      },
      include: bookingInclude,
    });
  });

  // A fresh claim makes the booking payable — prompt the mother to pay.
  if (claimed) {
    await notifyMotherNannyClaimed(updated);
  }

  return toBookingResponse(updated);
}

/** Nanny accepts a booking request (informational; does not confirm). */
export async function acceptBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  return applyNannyDecision(decoded, bookingId, 'ACCEPTED');
}

/** Nanny declines a booking request (informational; admin may still approve). */
export async function declineBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  return applyNannyDecision(decoded, bookingId, 'DECLINED');
}

/** Demo mock payment — simulates Paymob success or failure without a real provider. */
export async function mockPayBooking(
  decoded: DecodedIdToken,
  bookingId: string,
  body: MockPayBookingRequest,
): Promise<{ booking: BookingResponse; payment: object }> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can pay for bookings.');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');
  // Pay-after-approval: only an admin-APPROVED booking may be paid. Payment is
  // the final step and moves the booking straight to CONFIRMED.
  if (booking.status !== BookingStatus.APPROVED) {
    throw errors.badRequest(`Cannot pay for a booking in status ${booking.status}. It must be approved by an admin first.`);
  }
  if (!booking.nannyProfileId) {
    throw errors.badRequest('Booking has no assigned nanny yet.');
  }

  const [payment, updatedBooking] = await prisma.$transaction(async (tx) => {
    const pmt = await tx.payment.create({
      data: {
        bookingId,
        motherId: user.id,
        amount: booking.totalAmount,
        currency: 'EGP',
        method: body.method,
        status: body.succeed ? PaymentStatus.CAPTURED : PaymentStatus.FAILED,
        failureReason: body.succeed ? null : 'Mock payment declined',
      },
    });

    // On success move APPROVED → CONFIRMED (validated). On failure leave the
    // booking APPROVED so the mother can retry payment.
    if (body.succeed) {
      validateStatusTransition(booking.status, BookingStatus.CONFIRMED);
    }
    const bk = await tx.booking.update({
      where: { id: bookingId },
      data: body.succeed ? { status: BookingStatus.CONFIRMED } : {},
      include: bookingInclude,
    });

    return [pmt, bk] as const;
  });

  if (body.succeed) {
    await notifyNannyBookingConfirmed(updatedBooking);
  }

  return { booking: toBookingResponse(updatedBooking), payment };
}

/** Nanny checks in — marks booking IN_PROGRESS. Allowed from CHECK_IN_EARLY_MINUTES before start until end. */
export async function checkInBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies can check in.');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.nannyProfile?.userId !== user.id) throw errors.forbidden('This is not your booking.');

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw errors.badRequest(`Cannot check in to a booking in status ${booking.status}.`);
  }

  const now = new Date();
  const earliestCheckIn = new Date(
    booking.startTime.getTime() - CHECK_IN_EARLY_MINUTES * 60_000,
  );
  if (now < earliestCheckIn) {
    throw errors.badRequest(
      `Check-in opens ${CHECK_IN_EARLY_MINUTES} minutes before the scheduled start time.`,
    );
  }
  if (now > booking.endTime) {
    throw errors.badRequest('This booking has already ended.');
  }

  validateStatusTransition(booking.status, BookingStatus.IN_PROGRESS);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.IN_PROGRESS,
      nannyCheckedInAt: now,
    },
    include: bookingInclude,
  });

  const nannyName = updated.nannyProfile
    ? `${updated.nannyProfile.user.firstName} ${updated.nannyProfile.user.lastName}`
    : 'Your nanny';

  await notifyMotherBookingEvent(
    updated,
    'NANNY_CHECKIN',
    'Nanny checked in',
    `${nannyName} has started your booking.`,
  );

  return toBookingResponse(updated);
}

/** Nanny checks out — marks booking COMPLETED. Requires IN_PROGRESS. */
export async function checkOutBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies can check out.');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.nannyProfile?.userId !== user.id) throw errors.forbidden('This is not your booking.');

  if (booking.status !== BookingStatus.IN_PROGRESS) {
    throw errors.badRequest(`Cannot check out a booking in status ${booking.status}.`);
  }

  validateStatusTransition(booking.status, BookingStatus.COMPLETED);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETED,
      nannyCheckedOutAt: new Date(),
    },
    include: bookingInclude,
  });

  await notifyMotherBookingEvent(
    updated,
    'BOOKING_COMPLETED',
    'Booking complete',
    'Your booking is complete — leave a review?',
  );

  return toBookingResponse(updated);
}
