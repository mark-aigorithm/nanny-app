import type { NannyProfile, User } from '@prisma/client';
import { NannyApprovalStatus, Prisma } from '@prisma/client';
import {
  BookingStatus,
  getMissingNannyProfileFields,
  Role,
  type CreateReviewRequest,
  type NannyBookedSlotsQuery,
  type NannyDashboard,
  type NannyListItem,
  type NannyListQuery,
  type NannyProfileResponse,
  type NannyPublicProfile,
  type ReviewSummary,
  type UpdateNannyProfileRequest,
  type WeeklySchedule,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNannyProfileResponse(user: User, profile: NannyProfile): NannyProfileResponse {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: profile.bio,
    // Home location lives on the user row (single source of truth).
    location: user.address,
    latitude: user.latitude !== null ? Number(user.latitude) : null,
    longitude: user.longitude !== null ? Number(user.longitude) : null,
    yearsOfExperience: profile.yearsOfExperience,
    hourlyRate: profile.hourlyRate !== null ? Number(profile.hourlyRate) : null,
    certifications: profile.certifications,
    ageRanges: profile.ageRanges,
    specialties: profile.specialties,
    schedule: (profile.schedule as WeeklySchedule) ?? null,
    isProfileComplete: profile.isProfileComplete,
    availabilityType: profile.availabilityType,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
  };
}

function toNannyListItem(
  profile: NannyProfile & { user: User },
): NannyListItem {
  return {
    nannyProfileId: profile.id,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    avatarUrl: profile.user.avatarUrl,
    bio: profile.bio,
    // Home location lives on the user row (single source of truth).
    location: profile.user.address,
    yearsOfExperience: profile.yearsOfExperience,
    hourlyRate: profile.hourlyRate !== null ? Number(profile.hourlyRate) : null,
    certifications: profile.certifications,
    ageRanges: profile.ageRanges,
    specialties: profile.specialties,
    availabilityType: profile.availabilityType,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
  };
}

type ReviewWithMother = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  mother: User;
};

function toReviewSummary(r: ReviewWithMother): ReviewSummary {
  return {
    id: r.id,
    motherFirstName: r.mother.firstName,
    motherLastName: r.mother.lastName,
    motherAvatarUrl: r.mother.avatarUrl,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  };
}

async function requireNannyUser(uid: string) {
  const user = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    include: { nannyProfile: true },
  });
  if (!user || user.deletedAt) throw errors.notFound('User not found.');
  if (user.role !== Role.NANNY) throw errors.forbidden('Only nannies have a nanny profile.');
  return user;
}

// ── Self profile (nanny managing own profile) ─────────────────────────────────

export async function getNannyProfile(decoded: DecodedIdToken): Promise<NannyProfileResponse> {
  const user = await requireNannyUser(decoded.uid);
  if (!user.nannyProfile) throw errors.notFound('Nanny profile not found.');
  return toNannyProfileResponse(user, user.nannyProfile);
}

export async function updateNannyProfile(
  decoded: DecodedIdToken,
  body: UpdateNannyProfileRequest,
): Promise<NannyProfileResponse> {
  const user = await requireNannyUser(decoded.uid);

  // `location` is the nanny's free-text home label. It now lives on the user
  // row (users.address), the single source of truth for proximity search, so
  // it is pulled out of the nanny-profile write path and applied to the user.
  const { firstName, lastName, avatarUrl, location, ...profileFields } = body;

  const [updatedUser, updatedProfile] = await prisma.$transaction(async (tx) => {
    const u =
      firstName !== undefined ||
      lastName !== undefined ||
      avatarUrl !== undefined ||
      location !== undefined
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              ...(firstName !== undefined && { firstName }),
              ...(lastName !== undefined && { lastName }),
              ...(avatarUrl !== undefined && { avatarUrl }),
              ...(location !== undefined && { address: location }),
            },
          })
        : user;

    const existing = user.nannyProfile;
    const mergedBio = profileFields.bio ?? existing?.bio;
    // Completeness reads location from the user row now.
    const mergedLocation = location ?? user.address;
    const mergedYears =
      profileFields.yearsOfExperience !== undefined
        ? profileFields.yearsOfExperience
        : existing?.yearsOfExperience;
    const mergedRate =
      profileFields.hourlyRate !== undefined
        ? profileFields.hourlyRate
        : existing?.hourlyRate !== null && existing?.hourlyRate !== undefined
          ? Number(existing.hourlyRate)
          : undefined;

    const isProfileComplete =
      getMissingNannyProfileFields({
        bio: mergedBio ?? null,
        location: mergedLocation ?? null,
        yearsOfExperience: mergedYears ?? null,
        hourlyRate: mergedRate ?? null,
      }).length === 0;

    const p = await tx.nannyProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profileFields, isProfileComplete },
      update: { ...profileFields, isProfileComplete },
    });

    return [u, p] as const;
  });

  return toNannyProfileResponse(updatedUser, updatedProfile);
}

// ── Public nanny listing ──────────────────────────────────────────────────────

/**
 * Builds the Prisma `where` shared by the count and the (non-located) findMany.
 * Kept in sync, by hand, with the SQL predicates in `buildListFilterSql` below.
 */
function buildListWhere(query: NannyListQuery) {
  return {
    isProfileComplete: true,
    approvalStatus: NannyApprovalStatus.APPROVED,
    deletedAt: null as null,
    ...(query.availabilityType ? { availabilityType: query.availabilityType } : {}),
    ...(query.specialty ? { specialties: { has: query.specialty } } : {}),
    // Single `user` condition: always exclude soft-deleted users, and add the
    // name search when present. Kept as one object so the name filter does not
    // clobber the `deletedAt` guard (which would leak soft-deleted nannies into
    // the count and desync it from the raw-SQL rows).
    user: {
      deletedAt: null as null,
      ...(query.name
        ? {
            OR: [
              { firstName: { contains: query.name, mode: 'insensitive' as const } },
              { lastName: { contains: query.name, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
  };
}

/**
 * Same predicates as `buildListWhere`, as raw SQL over `nanny_profiles np`
 * joined to `users u`. Enum columns are compared as text since the Prisma enum
 * values are unmapped (stored verbatim: 'APPROVED', 'FULL_TIME', …).
 */
function buildListFilterSql(query: NannyListQuery): Prisma.Sql {
  const filters: Prisma.Sql[] = [
    Prisma.sql`np.is_profile_complete = true`,
    Prisma.sql`np.approval_status::text = 'APPROVED'`,
    Prisma.sql`np.deleted_at IS NULL`,
    Prisma.sql`u.deleted_at IS NULL`,
  ];
  if (query.availabilityType) {
    filters.push(Prisma.sql`np.availability_type::text = ${query.availabilityType}`);
  }
  if (query.specialty) {
    filters.push(Prisma.sql`${query.specialty} = ANY(np.specialties)`);
  }
  if (query.name) {
    const like = `%${query.name}%`;
    filters.push(Prisma.sql`(u.first_name ILIKE ${like} OR u.last_name ILIKE ${like})`);
  }
  return Prisma.join(filters, ' AND ');
}

export async function listNannies(
  query: NannyListQuery,
): Promise<{ nannies: NannyListItem[]; total: number }> {
  const where = buildListWhere(query);

  // Without caller coordinates, keep the simple rating-ordered, DB-paginated path.
  if (query.latitude === undefined || query.longitude === undefined) {
    const [total, profiles] = await Promise.all([
      prisma.nannyProfile.count({ where }),
      prisma.nannyProfile.findMany({
        where,
        include: { user: true },
        orderBy: { rating: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return { nannies: profiles.map(toNannyListItem), total };
  }

  // Location-aware "recommended" ranking: closest first, then highest-rated.
  // Distance is computed in PostGIS (ST_DistanceSphere → metres) so ordering
  // and pagination happen in the database. Coordinates live on the user row
  // (single source of truth). Nannies without coordinates sort last
  // (NULLS LAST), ranked among themselves by rating.
  const { latitude, longitude } = query;
  const offset = (query.page - 1) * query.limit;
  const filterSql = buildListFilterSql(query);

  const distanceSql = Prisma.sql`
    CASE
      WHEN u.latitude IS NOT NULL AND u.longitude IS NOT NULL THEN ST_DistanceSphere(
        ST_MakePoint(u.longitude::float8, u.latitude::float8),
        ST_MakePoint(${longitude}::float8, ${latitude}::float8)
      )
    END`;

  const [total, rows] = await Promise.all([
    prisma.nannyProfile.count({ where }),
    prisma.$queryRaw<Array<{ id: string; distance_m: number | null }>>(Prisma.sql`
      SELECT np.id AS id, ${distanceSql} AS distance_m
      FROM nanny_profiles np
      JOIN users u ON u.id = np.user_id
      WHERE ${filterSql}
      ORDER BY distance_m ASC NULLS LAST, np.rating DESC, np.id ASC
      LIMIT ${query.limit} OFFSET ${offset}
    `),
  ]);

  const distanceById = new Map(rows.map((r) => [r.id, r.distance_m]));
  const profiles = await prisma.nannyProfile.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { user: true },
  });
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  // Preserve the DB ordering (findMany does not guarantee `in` order).
  const nannies = rows.flatMap((r) => {
    const profile = profileById.get(r.id);
    if (!profile) return [];
    const distanceKm = r.distance_m !== null ? Math.round((r.distance_m / 1000) * 10) / 10 : null;
    return [{ ...toNannyListItem(profile), distanceKm }];
  });

  return { nannies, total };
}

export async function getNannyPublicProfile(nannyProfileId: string): Promise<NannyPublicProfile> {
  const profile = await prisma.nannyProfile.findUnique({
    where: {
      id: nannyProfileId,
      approvalStatus: NannyApprovalStatus.APPROVED,
      deletedAt: null,
    },
    include: {
      user: true,
      reviews: {
        where: { deletedAt: null },
        include: { mother: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  if (!profile) throw errors.notFound('Nanny not found.');

  return {
    ...toNannyListItem(profile),
    schedule: (profile.schedule as WeeklySchedule) ?? null,
    latitude: profile.user.latitude !== null ? Number(profile.user.latitude) : null,
    longitude: profile.user.longitude !== null ? Number(profile.user.longitude) : null,
    recentReviews: profile.reviews.map(toReviewSummary),
  };
}

// ── Booked slots ──────────────────────────────────────────────────────────────

export async function getNannyBookedSlots(
  nannyProfileId: string,
  query: NannyBookedSlotsQuery,
): Promise<string[]> {
  const date = new Date(query.date); // YYYY-MM-DD → midnight UTC

  const bookings = await prisma.booking.findMany({
    where: {
      nannyProfileId,
      deletedAt: null,
      date,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
    },
    select: { startTime: true, endTime: true },
  });

  const bookedSlots = new Set<string>();
  for (const b of bookings) {
    const startH = b.startTime.getUTCHours();
    const endH = b.endTime.getUTCHours();
    for (let h = startH; h < endH; h++) {
      bookedSlots.add(`${String(h).padStart(2, '0')}:00`);
    }
  }

  return Array.from(bookedSlots).sort();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getNannyDashboard(decoded: DecodedIdToken): Promise<NannyDashboard> {
  const user = await requireNannyUser(decoded.uid);
  if (!user.nannyProfile) throw errors.notFound('Nanny profile not found.');
  const nannyProfileId = user.nannyProfile.id;

  const now = new Date();

  // Start of current ISO week (Monday 00:00 UTC)
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysFromMonday));

  // Start of current month
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const baseWhere = { nannyProfileId, deletedAt: null as null };

  const [
    weekEarningsAgg,
    monthEarningsAgg,
    totalBookings,
    allBookings,
    repeatClientsRaw,
  ] = await Promise.all([
    // Nanny earnings are her hourly rate × hours (subtotal) — the service
    // fee on top belongs to the platform, so totalAmount must not be used.
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: weekStart } },
      _sum: { subtotal: true },
    }),
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: monthStart } },
      _sum: { subtotal: true },
    }),
    prisma.booking.count({
      where: { ...baseWhere, status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED] } },
    }),
    prisma.booking.findMany({
      where: { ...baseWhere },
      select: { status: true, motherId: true },
    }),
    prisma.booking.groupBy({
      by: ['motherId'],
      where: { ...baseWhere, status: BookingStatus.COMPLETED },
      having: { motherId: { _count: { gt: 1 } } },
    }),
  ]);

  const responded = allBookings.filter((b) => b.status !== BookingStatus.PENDING).length;
  const responseRate = allBookings.length > 0 ? Math.round((responded / allBookings.length) * 100) : 100;

  return {
    earningsThisWeek: Number(weekEarningsAgg._sum.subtotal ?? 0),
    earningsThisMonth: Number(monthEarningsAgg._sum.subtotal ?? 0),
    totalBookings,
    repeatClients: repeatClientsRaw.length,
    averageRating: Number(user.nannyProfile.rating),
    responseRate,
  };
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function createReview(
  decoded: DecodedIdToken,
  bookingId: string,
  body: CreateReviewRequest,
): Promise<ReviewSummary> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  if (user.role !== Role.MOTHER) throw errors.forbidden('Only mothers can leave reviews.');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId, deletedAt: null },
  });
  if (!booking) throw errors.notFound('Booking not found.');
  if (booking.motherId !== user.id) throw errors.forbidden('Access denied.');
  if (booking.status !== BookingStatus.COMPLETED) {
    throw errors.badRequest('You can only review completed bookings.');
  }
  if (!booking.nannyProfileId) throw errors.badRequest('No nanny to review.');

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) throw errors.conflict('You have already reviewed this booking.');

  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.create({
      data: {
        bookingId,
        nannyProfileId: booking.nannyProfileId!,
        motherId: user.id,
        rating: body.rating,
        comment: body.comment,
      },
      include: { mother: true },
    });

    // Recompute denormalised rating on the nanny profile.
    const agg = await tx.review.aggregate({
      where: { nannyProfileId: booking.nannyProfileId!, deletedAt: null },
      _avg: { rating: true },
      _count: { id: true },
    });
    await tx.nannyProfile.update({
      where: { id: booking.nannyProfileId! },
      data: {
        rating: agg._avg.rating ?? 0,
        reviewCount: agg._count.id,
      },
    });

    return r;
  });

  return toReviewSummary(review);
}
