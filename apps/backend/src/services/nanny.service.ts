import type { NannyProfile, User } from '@prisma/client';
import {
  BookingStatus,
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
    location: profile.location,
    latitude: profile.latitude !== null ? Number(profile.latitude) : null,
    longitude: profile.longitude !== null ? Number(profile.longitude) : null,
    yearsOfExperience: profile.yearsOfExperience,
    hourlyRate: profile.hourlyRate !== null ? Number(profile.hourlyRate) : null,
    certifications: profile.certifications,
    ageRanges: profile.ageRanges,
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
    location: profile.location,
    yearsOfExperience: profile.yearsOfExperience,
    hourlyRate: profile.hourlyRate !== null ? Number(profile.hourlyRate) : null,
    certifications: profile.certifications,
    ageRanges: profile.ageRanges,
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

  const { firstName, lastName, avatarUrl, ...profileFields } = body;

  const [updatedUser, updatedProfile] = await prisma.$transaction(async (tx) => {
    const u =
      firstName !== undefined || lastName !== undefined || avatarUrl !== undefined
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              ...(firstName !== undefined && { firstName }),
              ...(lastName !== undefined && { lastName }),
              ...(avatarUrl !== undefined && { avatarUrl }),
            },
          })
        : user;

    const existing = user.nannyProfile;
    const mergedBio = profileFields.bio ?? existing?.bio;
    const mergedLocation = profileFields.location ?? existing?.location;
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

    const isProfileComplete = !!(
      mergedBio &&
      mergedLocation &&
      mergedYears !== undefined &&
      mergedYears !== null &&
      mergedRate !== undefined &&
      mergedRate !== null
    );

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

export async function listNannies(
  query: NannyListQuery,
): Promise<{ nannies: NannyListItem[]; total: number }> {
  const where = {
    isProfileComplete: true,
    deletedAt: null as null,
    ...(query.availabilityType ? { availabilityType: query.availabilityType } : {}),
  };

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

export async function getNannyPublicProfile(nannyProfileId: string): Promise<NannyPublicProfile> {
  const profile = await prisma.nannyProfile.findUnique({
    where: { id: nannyProfileId, deletedAt: null },
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
    latitude: profile.latitude !== null ? Number(profile.latitude) : null,
    longitude: profile.longitude !== null ? Number(profile.longitude) : null,
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
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: weekStart } },
      _sum: { totalAmount: true },
    }),
    prisma.booking.aggregate({
      where: { ...baseWhere, status: BookingStatus.COMPLETED, date: { gte: monthStart } },
      _sum: { totalAmount: true },
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
    earningsThisWeek: Number(weekEarningsAgg._sum.totalAmount ?? 0),
    earningsThisMonth: Number(monthEarningsAgg._sum.totalAmount ?? 0),
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
