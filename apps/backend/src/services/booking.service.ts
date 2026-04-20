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
  type MockPayBookingRequest,
  type NearbyNanny,
  type PaginationMeta,
} from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { getServiceFeePercent } from './app-settings.service';
import { calculatePriceBreakdown } from './pricing.service';

// ── Prisma include shape ──────────────────────────────────────────────────────

const bookingInclude = {
  mother: true,
  nannyProfile: { include: { user: true } },
  payment: true,
} as const;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

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
          location: b.nannyProfile.location,
        }
      : null,
    status: b.status,
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
    createdAt: b.createdAt.toISOString(),
  };
}

/** Valid status transitions — enforces the booking lifecycle. */
const VALID_TRANSITIONS: Record<string, string[]> = {
  [BookingStatus.PENDING]:     [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]:   [BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED],
  [BookingStatus.COMPLETED]:   [BookingStatus.REFUNDED],
  [BookingStatus.CANCELLED]:   [BookingStatus.REFUNDED],
  [BookingStatus.REFUNDED]:    [],
};

export function validateStatusTransition(current: string, next: string): void {
  if (!VALID_TRANSITIONS[current]?.includes(next)) {
    throw errors.badRequest(`Cannot transition booking from ${current} to ${next}.`);
  }
}

function computeDurationHours(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.round((ms / 3_600_000) * 100) / 100;
}

async function assertNoConflict(
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
  });
  if (conflict) throw errors.conflict('This nanny is already booked for the requested time slot.');
}

// ── Public service functions ──────────────────────────────────────────────────

export async function createBooking(
  decoded: DecodedIdToken,
  body: CreateBookingRequest,
): Promise<BookingResponse> {
  console.log('body', body,"#########################");
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can create bookings.');

  const nanny = await prisma.nannyProfile.findUnique({
    where: { id: body.nannyProfileId, deletedAt: null },
  });
  if (!nanny) throw errors.notFound('Nanny not found.');
  if (!nanny.isProfileComplete) throw errors.badRequest('This nanny\'s profile is not complete yet.');
  if (!nanny.hourlyRate) throw errors.badRequest('This nanny has not set an hourly rate.');

  const startTime = new Date(body.startTime);
  const endTime = new Date(body.endTime);
  if (startTime >= endTime) throw errors.badRequest('startTime must be before endTime.');
  if (startTime < new Date()) throw errors.badRequest('Cannot book in the past.');

  const durationHours = computeDurationHours(startTime, endTime);
  if (durationHours < 1) throw errors.badRequest('Minimum booking duration is 1 hour.');
  if (durationHours > 12) throw errors.badRequest('Maximum booking duration is 12 hours.');

  await assertNoConflict(body.nannyProfileId, startTime, endTime);

  const serviceFeePercent = await getServiceFeePercent();
  const breakdown = calculatePriceBreakdown({
    baseRate: Number(nanny.hourlyRate),
    durationHours,
    serviceFeePercent,
  });

  const booking = await prisma.booking.create({
    data: {
      motherId: user.id,
      nannyProfileId: body.nannyProfileId,
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
    },
    include: bookingInclude,
  });

  return toBookingResponse(booking);
}

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

  // Find 5 nearest available nannies via Haversine formula.
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
      np.location,
      np.age_ranges                        AS "ageRanges",
      np.years_of_experience               AS "yearsOfExperience",
      (
        6371 * acos(
          LEAST(1.0,
            cos(radians(${body.latitude}::float))  * cos(radians(np.latitude::float)) *
            cos(radians(np.longitude::float) - radians(${body.longitude}::float)) +
            sin(radians(${body.latitude}::float))  * sin(radians(np.latitude::float))
          )
        )
      ) AS "distanceKm"
    FROM nanny_profiles np
    JOIN users u ON u.id = np.user_id
    WHERE np.deleted_at IS NULL
      AND u.deleted_at   IS NULL
      AND np.latitude    IS NOT NULL
      AND np.longitude   IS NOT NULL
      AND np.is_profile_complete = true
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
      orderBy: query.sortBy === 'createdAt' ? { createdAt: 'desc' } : { date: 'desc' },
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

/** Nanny accepts an EMERGENCY booking that has no assigned nanny yet. */
export async function acceptBooking(
  decoded: DecodedIdToken,
  bookingId: string,
): Promise<BookingResponse> {
  const user = await getUserByUid(decoded.uid);
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies can accept bookings.');

  const nannyProfile = await prisma.nannyProfile.findUnique({
    where: { userId: user.id, deletedAt: null },
  });
  if (!nannyProfile) throw errors.notFound('Nanny profile not found.');
  if (!nannyProfile.hourlyRate) throw errors.badRequest('Set your hourly rate before accepting bookings.');

  // Serializable-ish: read-then-update in a transaction to guard against
  // two nannies accepting the same emergency booking simultaneously.
  const updated = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId, deletedAt: null },
    });
    if (!booking) throw errors.notFound('Booking not found.');
    if (booking.status !== BookingStatus.PENDING) throw errors.badRequest('This booking is no longer available.');

    if (booking.type === BookingType.EMERGENCY) {
      if (booking.nannyProfileId !== null) throw errors.conflict('Another nanny has already accepted this booking.');

      await assertNoConflict(nannyProfile.id, booking.startTime, booking.endTime);

      const serviceFeePercent = await getServiceFeePercent();
      const breakdown = calculatePriceBreakdown({
        baseRate: Number(nannyProfile.hourlyRate),
        durationHours: Number(booking.durationHours),
        serviceFeePercent,
      });

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          nannyProfileId: nannyProfile.id,
          baseRate: breakdown.baseRate,
          subtotal: breakdown.subtotal,
          serviceFeePercent: breakdown.serviceFeePercent,
          serviceFeeAmount: breakdown.serviceFeeAmount,
          totalAmount: breakdown.totalAmount,
          status: BookingStatus.CONFIRMED,
        },
        include: bookingInclude,
      });
    } else {
      if (booking.nannyProfileId !== nannyProfile.id) throw errors.forbidden('This booking is not assigned to you.');
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CONFIRMED },
        include: bookingInclude,
      });
    }
  });

  return toBookingResponse(updated);
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
  if (booking.status !== BookingStatus.PENDING) {
    throw errors.badRequest(`Cannot pay for a booking in status ${booking.status}.`);
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

    const bk = await tx.booking.update({
      where: { id: bookingId },
      data: { status: body.succeed ? BookingStatus.CONFIRMED : BookingStatus.PENDING },
      include: bookingInclude,
    });

    return [pmt, bk] as const;
  });

  return { booking: toBookingResponse(updatedBooking), payment };
}

/** Nanny checks out — marks booking COMPLETED. Allowed from CONFIRMED or IN_PROGRESS. */
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

  if (
    booking.status !== BookingStatus.CONFIRMED &&
    booking.status !== BookingStatus.IN_PROGRESS
  ) {
    throw errors.badRequest(`Cannot check out a booking in status ${booking.status}.`);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.COMPLETED,
      nannyCheckedOutAt: new Date(),
    },
    include: bookingInclude,
  });

  return toBookingResponse(updated);
}
