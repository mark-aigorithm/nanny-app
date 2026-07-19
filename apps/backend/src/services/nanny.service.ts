import type { DiscountType, NannyProfile, Prisma as PrismaTypes, User } from '@prisma/client';
import { IdVerificationStatus, Prisma } from '@prisma/client';
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
  type PublicCertification,
  type PublicSkill,
  type ReviewSummary,
  type UpdateNannyProfileRequest,
  type WeeklySchedule,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { platformHour, toPlatformDateIso } from '@backend/lib/platform-time';
import { reconcileNannyCertifications } from '@backend/services/certification.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Prisma `include` for a nanny's active skills, joined through the NannySkill
 * join table to the Skill catalog. Reused by every read path that returns a
 * nanny so responses always carry the `skills` array.
 */
const nannySkillsInclude = {
  nannySkills: {
    where: { deletedAt: null },
    include: { skill: true },
  },
} as const;

/**
 * Prisma `include` for a nanny's active certifications, joined through the
 * NannyCertification join table to the Certification catalog. Reused by every
 * read path that returns a nanny so responses always carry the `certifications`
 * array. Certifications carry no fee, unlike skills.
 */
const nannyCertificationsInclude = {
  nannyCertifications: {
    where: { deletedAt: null },
    include: { certification: true },
  },
} as const;

/** Both catalog joins, spread into a single `include` for the common read paths. */
const nannyTagsInclude = {
  ...nannySkillsInclude,
  ...nannyCertificationsInclude,
} as const;

type NannySkillWithSkill = {
  skill: { id: number; name: string; feeType: DiscountType | null; feeValue: PrismaTypes.Decimal };
};
type NannyCertificationWithCert = {
  certification: { id: number; name: string };
};
type ProfileWithTags = NannyProfile & {
  nannySkills: NannySkillWithSkill[];
  nannyCertifications: NannyCertificationWithCert[];
};
type ProfileWithUserAndTags = ProfileWithTags & { user: User };

/** Flatten the join rows into the lightweight PublicSkill shape clients use. */
function toPublicSkills(nannySkills: NannySkillWithSkill[]): PublicSkill[] {
  return nannySkills.map((ns) => ({
    id: ns.skill.id,
    name: ns.skill.name,
    feeType: ns.skill.feeType,
    feeValue: Number(ns.skill.feeValue),
  }));
}

/** Flatten the join rows into the lightweight PublicCertification shape clients use. */
function toPublicCertifications(
  nannyCertifications: NannyCertificationWithCert[],
): PublicCertification[] {
  return nannyCertifications.map((nc) => ({
    id: nc.certification.id,
    name: nc.certification.name,
  }));
}

function toNannyProfileResponse(
  user: User,
  profile: ProfileWithTags,
): NannyProfileResponse {
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
    certifications: toPublicCertifications(profile.nannyCertifications),
    ageRanges: profile.ageRanges,
    skills: toPublicSkills(profile.nannySkills),
    schedule: (profile.schedule as WeeklySchedule) ?? null,
    isProfileComplete: profile.isProfileComplete,
    availabilityType: profile.availabilityType,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
  };
}

function toNannyListItem(profile: ProfileWithUserAndTags): NannyListItem {
  return {
    nannyProfileId: profile.id,
    firstName: profile.user.firstName,
    lastName: profile.user.lastName,
    avatarUrl: profile.user.avatarUrl,
    bio: profile.bio,
    // Home location lives on the user row (single source of truth).
    location: profile.user.address,
    yearsOfExperience: profile.yearsOfExperience,
    certifications: toPublicCertifications(profile.nannyCertifications),
    ageRanges: profile.ageRanges,
    skills: toPublicSkills(profile.nannySkills),
    availabilityType: profile.availabilityType,
    rating: Number(profile.rating),
    reviewCount: profile.reviewCount,
  };
}

type ReviewWithMother = {
  id: number;
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
    include: { nannyProfile: { include: nannyTagsInclude } },
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
  // `certificationIds` are reconciled into the NannyCertification join, not
  // written as a scalar column, so they are pulled out too.
  const { firstName, lastName, avatarUrl, location, certificationIds, ...profileFields } = body;

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

    const isProfileComplete =
      getMissingNannyProfileFields({
        bio: mergedBio ?? null,
        location: mergedLocation ?? null,
        yearsOfExperience: mergedYears ?? null,
      }).length === 0;

    const upserted = await tx.nannyProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profileFields, isProfileComplete },
      update: { ...profileFields, isProfileComplete },
      select: { id: true },
    });

    // Reconcile the certification links (nanny self-service) inside the same
    // transaction so the profile write and its tags stay atomic.
    if (certificationIds !== undefined) {
      await reconcileNannyCertifications(tx, upserted.id, certificationIds);
    }

    // Re-read with the tag joins so the response reflects the reconciled
    // certifications (the upsert snapshot predates the reconcile above).
    const p = await tx.nannyProfile.findUniqueOrThrow({
      where: { id: upserted.id },
      include: nannyTagsInclude,
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
    deletedAt: null as null,
    ...(query.availabilityType ? { availabilityType: query.availabilityType } : {}),
    ...(query.skillId
      ? { nannySkills: { some: { skillId: query.skillId, deletedAt: null } } }
      : {}),
    // Single `user` condition: exclude soft-deleted users, require an APPROVED
    // identity verification (the KYC gate now lives on the user row), and add
    // the name search when present. Kept as one object so the name filter does
    // not clobber the guards (which would leak soft-deleted / unvetted nannies
    // into the count and desync it from the raw-SQL rows).
    user: {
      deletedAt: null as null,
      idVerificationStatus: IdVerificationStatus.APPROVED,
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
    Prisma.sql`u.id_verification_status::text = 'APPROVED'`,
    Prisma.sql`np.deleted_at IS NULL`,
    Prisma.sql`u.deleted_at IS NULL`,
  ];
  if (query.availabilityType) {
    filters.push(Prisma.sql`np.availability_type::text = ${query.availabilityType}`);
  }
  if (query.skillId) {
    filters.push(
      Prisma.sql`EXISTS (SELECT 1 FROM nanny_skills ns WHERE ns.nanny_profile_id = np.id AND ns.skill_id = ${query.skillId} AND ns.deleted_at IS NULL)`,
    );
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
        include: { user: true, ...nannyTagsInclude },
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
    prisma.$queryRaw<Array<{ id: number; distance_m: number | null }>>(Prisma.sql`
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
    include: { user: true, ...nannyTagsInclude },
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

export async function getNannyPublicProfile(nannyProfileId: number): Promise<NannyPublicProfile> {
  // findFirst (not findUnique) so we can filter on the related user's KYC state,
  // which is where identity verification now lives.
  const profile = await prisma.nannyProfile.findFirst({
    where: {
      id: nannyProfileId,
      deletedAt: null,
      user: { idVerificationStatus: IdVerificationStatus.APPROVED, deletedAt: null },
    },
    include: {
      user: true,
      ...nannyTagsInclude,
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
  nannyProfileId: number,
  query: NannyBookedSlotsQuery,
): Promise<string[]> {
  const date = new Date(query.date); // YYYY-MM-DD → midnight UTC
  const dayBefore = new Date(date.getTime() - 86_400_000);

  // `date` is the day a booking STARTS, so one that runs past midnight keeps the
  // previous day's date while occupying hours on this one. Pull both days in and
  // let the hour arithmetic below place them.
  const bookings = await prisma.booking.findMany({
    where: {
      nannyProfileId,
      deletedAt: null,
      date: { in: [date, dayBefore] },
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
    },
    select: { startTime: true, endTime: true },
  });

  const bookedSlots = new Set<string>();
  for (const b of bookings) {
    // Platform hours, not UTC: these labels are shown against wall-clock slots.
    const startHour = platformHour(b.startTime);
    const endHour = platformHour(b.endTime);
    // An end at or before the start means the booking ran past midnight.
    const endHourAbsolute = endHour <= startHour ? endHour + 24 : endHour;

    // Re-base onto the requested day: a booking that started yesterday only
    // occupies today's early hours, and one starting today that runs past
    // midnight only occupies today's hours up to it. Without this, yesterday's
    // ordinary midday booking would blank out today's midday slots.
    const shift = toPlatformDateIso(b.startTime) === query.date ? 0 : -24;
    const from = Math.max(startHour + shift, 0);
    const to = Math.min(endHourAbsolute + shift, 24);
    for (let h = from; h < to; h++) {
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
    // Nanny earnings are her share of the total under the revenue split
    // (nannyAmount) — the platform's share must not be counted.
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: weekStart } },
      _sum: { nannyAmount: true },
    }),
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: monthStart } },
      _sum: { nannyAmount: true },
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
    earningsThisWeek: Number(weekEarningsAgg._sum.nannyAmount ?? 0),
    earningsThisMonth: Number(monthEarningsAgg._sum.nannyAmount ?? 0),
    totalBookings,
    repeatClients: repeatClientsRaw.length,
    averageRating: Number(user.nannyProfile.rating),
    responseRate,
  };
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function createReview(
  decoded: DecodedIdToken,
  bookingId: number,
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
