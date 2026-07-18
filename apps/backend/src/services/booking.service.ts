import { Prisma } from '@prisma/client';
import {
  type AppliedSkillFee,
  BookingStatus,
  BookingType,
  PaymentStatus,
  bookingLeadTimeMessage,
  bookingWindowMessage,
  isBookingWithinDailyWindow,
  PLATFORM_TIMEZONE,
  type BookingListQuery,
  type BookingOptions,
  type BookingResponse,
  type CancelBookingRequest,
  type CreateBookingRequest,
  type GenerateStartPinResponse,
  type MockPayBookingRequest,
  type PaginationMeta,
  type PricingConfig,
  type RedeemBookingPointsRequest,
  type ValidateBookingPromoRequest,
  type ValidateBookingPromoResponse,
} from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';
import {
  IdVerificationStatus,
  NannyBookingDecision,
  NotificationReferenceType,
  NotificationType,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { isWithinRadius, toLatLng } from '@backend/lib/geo';
import { hashPin, randomStartPin } from '@backend/lib/pin';
import {
  assertWallClock,
  toPlatformDateColumn,
  toPlatformIso,
  toPlatformWallClock,
  wallClockToUtc,
} from '@backend/lib/platform-time';
import { getBroadcastRadiusKm, getPlatformConfig } from './app-settings.service';
import { createInAppNotification, dispatchPush } from './notification.service';
import {
  buildBreakdown,
  getPricingConfig,
  getPricingInputs,
} from './pricing-config.service';
import { redeemPromoCode, validatePromoCode } from './promo-code.service';
import {
  applyBookingRedemption,
  awardPointsForBooking,
  notifyPointsRedeemed,
  notifyPointsRefunded,
  refundBookingRedemption,
} from './reward.service';

/** Minutes before scheduled start when nanny may check in. */
export const CHECK_IN_EARLY_MINUTES = 15;

/** How long a parent-generated start PIN stays valid (covers the early window + slack). */
export const START_PIN_TTL_MINUTES = 20;

/** Max wrong PIN attempts before the parent must regenerate. */
export const START_PIN_MAX_ATTEMPTS = 5;

/** Round to 2 decimals for money/hour math. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

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

/** Reads the persisted skill add-on snapshot back into typed form. */
function parseSkillAddOns(raw: Prisma.JsonValue | null | undefined): AppliedSkillFee[] {
  return Array.isArray(raw) ? (raw as unknown as AppliedSkillFee[]) : [];
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
          location: b.nannyProfile.user.address,
        }
      : null,
    status: b.status,
    nannyDecision: b.nannyDecision,
    nannyDecidedAt: b.nannyDecidedAt?.toISOString() ?? null,
    adminApprovedAt: b.adminApprovedAt?.toISOString() ?? null,
    type: b.type,
    date: b.date.toISOString().slice(0, 10),
    // startTime/endTime are the only wall-clock-meaningful fields on this
    // payload — a booking happens at "9am Cairo", so they carry the platform
    // offset and the client reads the wall-clock straight off the string. Every
    // other timestamp here (nannyDecidedAt, createdAt, checked-in/out, payment)
    // is an INSTANT with no wall-clock meaning, so plain UTC is correct for
    // those. Don't "fix" them to match.
    startTime: toPlatformIso(b.startTime),
    endTime: toPlatformIso(b.endTime),
    durationHours: Number(b.durationHours),
    baseRate: Number(b.baseRate),
    effectiveHourlyRate: Number(b.effectiveHourlyRate),
    skillAddOns: parseSkillAddOns(b.selectedSkillFees),
    subtotal: Number(b.subtotal),
    durationMultiplier: Number(b.durationMultiplier),
    discountAmount: Number(b.discountAmount),
    serviceFeePercent: Number(b.serviceFeePercent),
    serviceFeeAmount: Number(b.serviceFeeAmount),
    totalAmount: Number(b.totalAmount),
    nannyAmount: Number(b.nannyAmount),
    platformAmount: Number(b.platformAmount),
    rewardCreditHoursApplied: Number(b.rewardCreditHoursApplied),
    rewardCreditPoints: b.rewardCreditPoints,
    rewardCreditAmount: Number(b.rewardCreditAmount),
    specialInstructions: b.specialInstructions,
    cancellationReason: b.cancellationReason,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    nannyCheckedInAt: b.nannyCheckedInAt?.toISOString() ?? null,
    nannyCheckedOutAt: b.nannyCheckedOutAt?.toISOString() ?? null,
    startPinActive:
      b.startPinExpiresAt != null && b.startPinExpiresAt.getTime() > Date.now(),
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
 * approved nanny with a complete profile who is free for the requested window
 * and within the configured broadcast radius of the booking's location (nannies
 * or bookings without coordinates always match, and radius 0 disables the
 * distance filter — see AppSettings broadcast_radius_km).
 * No payment has been taken; the mother pays once a nanny claims the request.
 */
async function notifyBookingBroadcast(booking: BookingWithRelations): Promise<void> {
  const dateLabel = booking.date.toISOString().slice(0, 10);

  const [radiusKm, candidates] = await Promise.all([
    getBroadcastRadiusKm(),
    prisma.nannyProfile.findMany({
      where: {
        deletedAt: null,
        isProfileComplete: true,
        // KYC gate now lives on the user row.
        user: { deletedAt: null, idVerificationStatus: IdVerificationStatus.APPROVED },
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
      select: {
        userId: true,
        user: { select: { latitude: true, longitude: true } },
      },
    }),
  ]);

  const bookingPoint = toLatLng(booking.latitude, booking.longitude);
  const nannies = candidates.filter((n) =>
    isWithinRadius(bookingPoint, toLatLng(n.user.latitude, n.user.longitude), radiusKm),
  );

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
 * (applyNannyDecision). The price is known up front because it uses the FIXED
 * platform hourly rate, so the mother sees her total immediately. The nanny
 * time-conflict check happens at claim time, not here.
 */
export async function createBooking(
  decoded: DecodedIdToken,
  body: CreateBookingRequest,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can create bookings.');

  // Identity gate: a mother must have an ID on file before booking. She may book
  // while it is still PENDING_REVIEW (upload-then-book), but not when she has
  // never uploaded (PENDING_ID) or was rejected (REJECTED) and must re-upload.
  if (
    user.idVerificationStatus === IdVerificationStatus.PENDING_ID ||
    user.idVerificationStatus === IdVerificationStatus.REJECTED
  ) {
    throw errors.forbidden('Please upload your ID before booking.');
  }

  const config = await getPlatformConfig();

  // Shape first, so the checks below can trust the strings. Zod already enforces
  // this at the route; without it here, an offset-bearing time from an outdated
  // client would fail the window check (which fails closed on anything it can't
  // parse) and get told the window is shut rather than that its format is wrong.
  assertWallClock(body.startTime, 'startTime');
  assertWallClock(body.endTime, 'endTime');

  // Ordering, on the raw wall-clock strings. They're fixed-width, so comparing
  // them lexicographically is comparing them chronologically, and endTime
  // carries its own date — a booking ending after midnight needs no special case.
  if (body.endTime <= body.startTime) {
    throw errors.badRequest('startTime must be before endTime.');
  }

  // The daily window is pure wall-clock arithmetic, so it's checked before any
  // timezone is involved. It comes before the lead-time check so a parent asking
  // for 3am is told the window is closed, not that they should book earlier.
  if (
    !isBookingWithinDailyWindow(
      body.startTime,
      body.endTime,
      config.bookingWindowStartHour,
      config.bookingWindowEndHour,
    )
  ) {
    throw errors.badRequest(
      bookingWindowMessage(config.bookingWindowStartHour, config.bookingWindowEndHour),
    );
  }

  // Wall-clock → the real instants we store and compare against. Throws a 400 if
  // the parent picked a time that doesn't exist on a DST spring-forward night.
  const startTime = wallClockToUtc(body.startTime);
  const endTime = wallClockToUtc(body.endTime);

  // Duration is real elapsed time, not the wall-clock difference: on a DST night
  // an "8 hour" pick is genuinely 7 or 9 hours of care, and that's what the nanny
  // works and the mother pays for.
  const durationHours = computeDurationHours(startTime, endTime);
  if (durationHours < config.minBookingHours) {
    throw errors.badRequest(`Minimum booking duration is ${config.minBookingHours} hours.`);
  }
  if (durationHours > config.maxBookingHours) {
    throw errors.badRequest(`Maximum booking duration is ${config.maxBookingHours} hours.`);
  }

  // Lead time. Subsumes the old "cannot book in the past" check — at a 0-hour
  // minimum this is exactly that, which is why the message says so.
  if (startTime.getTime() < Date.now() + config.minAdvanceBookingHours * 3_600_000) {
    throw errors.badRequest(bookingLeadTimeMessage(config.minAdvanceBookingHours));
  }

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

  // Load base rate, revenue split, add-on skills and duration tiers once, then
  // price the booking including any selected skill add-ons and duration discount.
  const pricingInputs = await getPricingInputs();
  const skillIds = body.skillIds ?? [];

  // Price once up-front (add-ons + duration tier, before any discount) to know
  // the subtotal and effective hourly rate.
  const preBreakdown = buildBreakdown(pricingInputs, { durationHours, skillIds });

  // Validate the promo against that subtotal so the discount can't exceed
  // what's owed.
  let promoCodeId: string | null = null;
  let discountAmount = 0;
  if (body.promoCode) {
    const validated = await validatePromoCode(body.promoCode, preBreakdown.subtotal, user.id);
    promoCodeId = validated.promoCodeId;
    discountAmount = validated.discountAmount;
  }

  const breakdown = buildBreakdown(pricingInputs, { durationHours, skillIds, discountAmount });

  const data: Prisma.BookingUncheckedCreateInput = {
    motherId: user.id,
    nannyProfileId: null,
    status: BookingStatus.PENDING,
    type: BookingType.STANDARD,
    // Derived from the start, never sent by the client. For a booking that runs
    // past midnight this is the day it STARTS, keeping `date` in agreement with
    // `startTime` — which getNannyBookedSlots and the dashboard aggregates rely on.
    date: toPlatformDateColumn(startTime),
    startTime,
    endTime,
    // Snapshot the mother's location so the broadcast radius is computed
    // against where the booking was requested, even if she later moves.
    latitude: user.latitude,
    longitude: user.longitude,
    durationHours: breakdown.durationHours,
    baseRate: breakdown.baseRate,
    effectiveHourlyRate: breakdown.effectiveHourlyRate,
    subtotal: breakdown.subtotal,
    durationMultiplier: breakdown.durationMultiplier,
    discountAmount: breakdown.discountAmount,
    serviceFeePercent: breakdown.serviceFeePercent,
    serviceFeeAmount: breakdown.serviceFeeAmount,
    totalAmount: breakdown.totalAmount,
    nannyAmount: breakdown.nannyAmount,
    platformAmount: breakdown.platformAmount,
    selectedSkillFees: breakdown.skillAddOns as unknown as Prisma.InputJsonValue,
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
  return getPricingConfig();
}

/**
 * What the date/time picker needs to decide which slots to offer.
 *
 * `earliestStartWallClock` is computed here, from the server's clock, rather
 * than on the device: the client then filters slots with a plain string compare
 * and needs neither a timezone database nor a trustworthy clock. It's a hint —
 * `createBooking` re-checks the real instant regardless.
 */
export async function getBookingOptions(): Promise<BookingOptions> {
  const config = await getPlatformConfig();
  const now = new Date();
  return {
    bookingWindowStartHour: config.bookingWindowStartHour,
    bookingWindowEndHour: config.bookingWindowEndHour,
    minBookingHours: config.minBookingHours,
    maxBookingHours: config.maxBookingHours,
    minAdvanceBookingHours: config.minAdvanceBookingHours,
    timezone: PLATFORM_TIMEZONE,
    nowWallClock: toPlatformWallClock(now),
    earliestStartWallClock: toPlatformWallClock(
      new Date(now.getTime() + config.minAdvanceBookingHours * 3_600_000),
    ),
  };
}

export async function validateBookingPromo(
  decoded: DecodedIdToken,
  body: ValidateBookingPromoRequest,
): Promise<ValidateBookingPromoResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can apply promo codes.');

  // The client sends the priced subtotal (rate × hours × duration tier, add-ons
  // included). Under the revenue-split model there is no fee added on top.
  const { discountAmount } = await validatePromoCode(body.code, body.subtotal, user.id);
  return { discountAmount };
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
 * Soonest-starting first. Filtered to the configured broadcast radius around
 * each request's location — the pool matches what the nanny was notified
 * about. Requests or nannies without coordinates, or radius 0, bypass the
 * distance filter (never hide work because a profile is incomplete).
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
    select: { id: true, user: { select: { latitude: true, longitude: true } } },
  });
  if (!nannyProfile) throw errors.notFound('Nanny profile not found.');

  const [radiusKm, busy, open] = await Promise.all([
    getBroadcastRadiusKm(),
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

  const nannyPoint = toLatLng(nannyProfile.user.latitude, nannyProfile.user.longitude);
  const available = open.filter(
    (b) =>
      !busy.some((slot) => slot.startTime < b.endTime && slot.endTime > b.startTime) &&
      isWithinRadius(nannyPoint, toLatLng(b.latitude, b.longitude), radiusKm),
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

  // Return any Care Points the parent applied to this (still unpaid) booking.
  // Best-effort — a reward hiccup must not block a cancellation.
  try {
    await refundBookingIfApplied(booking);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rewards] failed to refund points on cancel', { bookingId, err });
  }

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
 * For an UNCLAIMED request (nannyProfileId = null), ACCEPT *claims* it: the
 * nanny is assigned and the booking moves PENDING → APPROVED so it becomes
 * payable immediately — there is no admin approval gate. First to accept wins:
 * the claim is a conditional updateMany guarded on
 * (status = PENDING AND nannyProfileId IS NULL), so the database itself
 * guarantees exactly one winner under concurrent accepts — the loser's write
 * matches no row and gets a conflict error. You can't decline an unclaimed
 * request (it isn't yours) — you simply don't claim it. The request keeps the
 * fixed platform price it was created with.
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

  // The claim runs in a transaction; the atomic status-guarded updateMany
  // below is what prevents two nannies claiming the same request.
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

      validateStatusTransition(booking.status, BookingStatus.APPROVED);

      // Atomic first-to-accept guard: the write only matches a row that is
      // still an unclaimed PENDING request at commit time. If a concurrent
      // claim won, count is 0 and this nanny loses cleanly. (Same guarded-
      // updateMany pattern as the check-in PIN validation.)
      const claim = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
          nannyProfileId: null,
          deletedAt: null,
        },
        data: {
          nannyProfileId: nannyProfile.id,
          status: BookingStatus.APPROVED,
          nannyDecision: decisionValue,
          nannyDecidedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw errors.conflict('This request was already accepted by another nanny.');
      }
      claimed = true;

      return tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: bookingInclude,
      });
    }

    // Assigned booking (already claimed by this nanny, or a booking routed to
    // her): record the informational decision only.
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
        // Any Care Points redemption was already applied to totalAmount before
        // this checkout, so we simply charge the current total.
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

/**
 * Apply Care Points against an APPROVED booking before payment. Deducts the
 * points now and lowers the amount to be charged (whatever provider then bills
 * it). The points are refunded by {@link refundBookingPoints} if the payment is
 * not completed. A booking that already has points applied must be cleared first.
 */
export async function redeemBookingPoints(
  decoded: DecodedIdToken,
  bookingId: string,
  body: RedeemBookingPointsRequest,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can redeem points.');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');
  if (booking.status !== BookingStatus.APPROVED) {
    throw errors.badRequest('Points can only be applied to an approved booking before payment.');
  }
  if (Number(booking.rewardCreditAmount) > 0) {
    throw errors.badRequest('Points are already applied. Remove them first to change the amount.');
  }

  const perHour = Number(booking.effectiveHourlyRate) || Number(booking.baseRate);

  const updated = await prisma.$transaction(async (tx) => {
    const { hours, pointsCost, discount: rawDiscount } = await applyBookingRedemption(tx, {
      userId: user.id,
      bookingId,
      redeemHours: body.hours,
      perHour,
      durationHours: Number(booking.durationHours),
    });
    // Never discount below zero owed. The platform funds the reward — the
    // nanny's earnings (nannyAmount) are never touched.
    const discount = Math.min(rawDiscount, Number(booking.totalAmount));
    return tx.booking.update({
      where: { id: bookingId },
      data: {
        discountAmount: round2(Number(booking.discountAmount) + discount),
        totalAmount: round2(Number(booking.totalAmount) - discount),
        platformAmount: round2(Number(booking.platformAmount) - discount),
        rewardCreditHoursApplied: hours,
        rewardCreditPoints: pointsCost,
        rewardCreditAmount: discount,
      },
      include: bookingInclude,
    });
  });

  await notifyPointsRedeemed(
    user.id,
    updated.rewardCreditPoints,
    Number(updated.rewardCreditHoursApplied),
  );
  return toBookingResponse(updated);
}

/**
 * Restore a booking's applied Care Points (points back to the wallet, amount
 * back onto the total). Only valid while the booking is still unpaid (APPROVED);
 * a no-op if nothing is applied. Used by the parent (to change their mind), and
 * internally when a payment fails or the booking is cancelled.
 */
async function refundBookingIfApplied(
  booking: BookingWithRelations,
): Promise<BookingWithRelations | null> {
  const points = booking.rewardCreditPoints;
  const amount = Number(booking.rewardCreditAmount);
  // Only reverse while unpaid — a CONFIRMED/paid booking keeps its discount.
  if (points <= 0 || amount <= 0 || booking.status !== BookingStatus.APPROVED) return null;

  const updated = await prisma.$transaction(async (tx) => {
    await refundBookingRedemption(tx, {
      userId: booking.motherId,
      bookingId: booking.id,
      points,
    });
    return tx.booking.update({
      where: { id: booking.id },
      data: {
        discountAmount: round2(Number(booking.discountAmount) - amount),
        totalAmount: round2(Number(booking.totalAmount) + amount),
        platformAmount: round2(Number(booking.platformAmount) + amount),
        rewardCreditHoursApplied: 0,
        rewardCreditPoints: 0,
        rewardCreditAmount: 0,
      },
      include: bookingInclude,
    });
  });
  await notifyPointsRefunded(booking.motherId, points);
  return updated;
}

/** Parent-facing "remove applied points" / refund-on-failure endpoint. */
export async function refundBookingPoints(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');

  const updated = await refundBookingIfApplied(booking);
  return toBookingResponse(updated ?? booking);
}

/**
 * Parent generates the 4-digit start PIN — the hand-off gate for check-in. Only
 * the mother who owns the booking may call this, and only inside the check-in
 * window. Returns the plaintext PIN once (never persisted or returned again);
 * only the sha-256 hash is stored. Calling again regenerates and resets attempts.
 */
export async function generateStartPin(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<GenerateStartPinResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Only the parent can start this booking.');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
    include: bookingInclude,
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('This is not your booking.');

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw errors.badRequest(`Cannot start a booking in status ${booking.status}.`);
  }

  const now = new Date();
  const earliestStart = new Date(
    booking.startTime.getTime() - CHECK_IN_EARLY_MINUTES * 60_000,
  );
  if (now < earliestStart) {
    throw errors.badRequest(
      `You can start this booking ${CHECK_IN_EARLY_MINUTES} minutes before the scheduled start time.`,
    );
  }
  if (now > booking.endTime) {
    throw errors.badRequest('This booking has already ended.');
  }

  const pin = randomStartPin();
  const expiresAt = new Date(now.getTime() + START_PIN_TTL_MINUTES * 60_000);

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      startPinHash: hashPin(pin),
      startPinGeneratedAt: now,
      startPinExpiresAt: expiresAt,
      startPinAttempts: 0,
    },
  });

  return { pin, expiresAt: expiresAt.toISOString() };
}

/**
 * Nanny checks in — marks booking IN_PROGRESS. Allowed from CHECK_IN_EARLY_MINUTES
 * before start until end, and only with the correct start PIN the parent revealed.
 */
export async function checkInBooking(
  decoded: DecodedIdToken,
  bookingId: string,
  pin: string,
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

  // Start-PIN gate — the parent must have revealed a still-valid PIN and the
  // nanny must enter it correctly. Wrong guesses are counted and capped.
  if (!booking.startPinHash || !booking.startPinExpiresAt) {
    throw errors.badRequest('The parent has not started this booking yet. Ask them to tap Start.');
  }
  if (now > booking.startPinExpiresAt) {
    throw errors.badRequest('The start PIN has expired. Ask the parent to start again.');
  }
  if (booking.startPinAttempts >= START_PIN_MAX_ATTEMPTS) {
    throw errors.badRequest('Too many incorrect attempts. Ask the parent to start again.');
  }
  if (hashPin(pin) !== booking.startPinHash) {
    // Atomically bump the attempt count only while it still matches what we read,
    // so a burst of parallel guesses can't slip past the cap (updateMany allows
    // the non-unique guard in the where clause).
    await prisma.booking.updateMany({
      where: { id: bookingId, startPinAttempts: booking.startPinAttempts },
      data: { startPinAttempts: { increment: 1 } },
    });
    throw errors.badRequest('Incorrect PIN.');
  }

  validateStatusTransition(booking.status, BookingStatus.IN_PROGRESS);

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.IN_PROGRESS,
      nannyCheckedInAt: now,
      // Clear the PIN so the code can't be reused.
      startPinHash: null,
      startPinExpiresAt: null,
      startPinAttempts: 0,
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

  // Award Care Points for the completed booking. Best-effort + idempotent — a
  // reward failure must never block a nanny's checkout.
  try {
    await awardPointsForBooking({
      bookingId: updated.id,
      motherId: updated.motherId,
      durationHours: Number(updated.durationHours),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[rewards] failed to award points on checkout', {
      bookingId: updated.id,
      err,
    });
  }

  return toBookingResponse(updated);
}
