import {
  CommunityPostType,
  NotificationReferenceType,
  PostModerationStatus,
  Prisma,
} from '@prisma/client';

import {
  normalizePhone,
  type AdminListQuery,
  type AdminMarketplaceListing,
  type AdminMarketplaceListQuery,
  type CreateOfficialListingInput,
  type PaginationMeta,
  type RejectListingInput,
  type UpdateOfficialListingInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

const listingInclude = {
  author: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
} satisfies Prisma.CommunityPostInclude;

type ListingRow = Prisma.CommunityPostGetPayload<{ include: typeof listingInclude }>;

function toApiStatus(status: PostModerationStatus): AdminMarketplaceListing['moderationStatus'] {
  switch (status) {
    case PostModerationStatus.PENDING:
      return 'pending';
    case PostModerationStatus.REJECTED:
      return 'rejected';
    default:
      return 'approved';
  }
}

function toDto(row: ListingRow): AdminMarketplaceListing {
  return {
    id: row.id,
    title: row.title ?? '',
    body: row.body,
    price: row.price !== null ? Number(row.price) : null,
    imageUrls: row.imageUrls,
    tags: row.tags,
    moderationStatus: toApiStatus(row.moderationStatus),
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    isOfficial: row.isOfficial,
    contactPhone: row.contactPhone,
    seller: {
      id: row.author.id,
      // The '-' placeholder last name (see the mothers list) is dropped.
      name: `${row.author.firstName} ${row.author.lastName === '-' ? '' : row.author.lastName}`.trim(),
      avatarUrl: row.author.avatarUrl,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Resolve the calling admin's internal user id from their Firebase uid. */
async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
  const admin = await prisma.user.findFirst({
    where: {
      firebaseUid: adminFirebaseUid,
      deletedAt: null,
      role: { in: ['ADMIN', 'SUPERUSER', 'OPERATOR'] },
    },
    select: { id: true },
  });
  if (!admin) throw errors.forbidden('Admin access required');
  return admin.id;
}

async function loadListing(id: number): Promise<ListingRow> {
  const listing = await prisma.communityPost.findFirst({
    where: { id, type: CommunityPostType.MARKETPLACE, deletedAt: null },
    include: listingInclude,
  });
  if (!listing) throw errors.notFound('Listing not found.');
  return listing;
}

/**
 * Tell the seller what happened to her listing. Skipped for official listings,
 * where the admin is the author and would be notifying himself.
 */
async function notifySeller(
  listing: ListingRow,
  approved: boolean,
  reason?: string,
): Promise<void> {
  if (listing.isOfficial) return;

  const title = approved ? 'Your listing is live' : 'Your listing needs changes';
  const body = approved
    ? `"${listing.title ?? 'Your listing'}" was approved and is now in the marketplace.`
    : `"${listing.title ?? 'Your listing'}" was not approved: ${reason ?? 'please review it and resubmit.'}`;

  await createInAppNotification({
    userId: listing.authorId,
    type: approved ? 'MARKETPLACE_LISTING_APPROVED' : 'MARKETPLACE_LISTING_REJECTED',
    title,
    body,
    referenceId: listing.id,
    referenceType: NotificationReferenceType.COMMUNITY_POST,
  });
  await dispatchPush(listing.authorId, {
    title,
    body,
    data: {
      type: approved ? 'marketplace_listing_approved' : 'marketplace_listing_rejected',
      postId: String(listing.id),
    },
  });
}

/**
 * The moderation queue. Defaults (via the query schema) to PENDING — the
 * listings actually waiting on an admin — with the oldest submission first so
 * sellers are served in the order they posted.
 */
export async function listMarketplaceListings(
  status: AdminMarketplaceListQuery['status'],
  { page, limit }: AdminListQuery,
): Promise<{ listings: AdminMarketplaceListing[]; meta: PaginationMeta }> {
  const where: Prisma.CommunityPostWhereInput = {
    type: CommunityPostType.MARKETPLACE,
    deletedAt: null,
    ...(status !== 'ALL' ? { moderationStatus: status as PostModerationStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.communityPost.count({ where }),
    prisma.communityPost.findMany({
      where,
      include: listingInclude,
      orderBy:
        status === 'PENDING'
          ? { createdAt: 'asc' }
          : [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    listings: rows.map(toDto),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Publish a listing. Idempotent — approving an approved listing is a no-op. */
export async function approveListing(
  id: number,
  adminFirebaseUid: string,
): Promise<AdminMarketplaceListing> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const listing = await loadListing(id);

  if (listing.moderationStatus === PostModerationStatus.APPROVED) {
    return toDto(listing);
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      moderationStatus: PostModerationStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: listingInclude,
  });

  await notifySeller(updated, true);
  return toDto(updated);
}

/**
 * Reject a listing with a reason the seller sees in "My listings". Also serves
 * as a takedown: an already-approved listing can be rejected, which pulls it
 * straight out of the feed.
 */
export async function rejectListing(
  id: number,
  input: RejectListingInput,
  adminFirebaseUid: string,
): Promise<AdminMarketplaceListing> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const listing = await loadListing(id);

  if (listing.isOfficial) {
    throw errors.badRequest('Official listings are not reviewed. Delete it instead.');
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      moderationStatus: PostModerationStatus.REJECTED,
      rejectionReason: input.reason,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: listingInclude,
  });

  await notifySeller(updated, false, input.reason);
  return toDto(updated);
}

/**
 * Publish an official ("Sold by NannyNow") listing. Authored by the acting
 * admin, approved on creation, and pinned above seller listings in the feed.
 */
export async function createOfficialListing(
  input: CreateOfficialListingInput,
  adminFirebaseUid: string,
): Promise<AdminMarketplaceListing> {
  const adminId = await resolveAdminId(adminFirebaseUid);

  const created = await prisma.communityPost.create({
    data: {
      authorId: adminId,
      type: CommunityPostType.MARKETPLACE,
      title: input.title,
      body: input.body ?? null,
      price: new Prisma.Decimal(input.price),
      imageUrls: input.imageUrls,
      tags: input.tags ?? [],
      isOfficial: true,
      contactPhone: normalizePhone(input.contactPhone),
      moderationStatus: PostModerationStatus.APPROVED,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: listingInclude,
  });

  return toDto(created);
}

/** Edit an official listing. Never re-enters review — an admin authored it. */
export async function updateOfficialListing(
  id: number,
  input: UpdateOfficialListingInput,
): Promise<AdminMarketplaceListing> {
  const listing = await loadListing(id);
  if (!listing.isOfficial) {
    throw errors.badRequest('Only official listings can be edited here.');
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price) } : {}),
      ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.contactPhone !== undefined
        ? { contactPhone: normalizePhone(input.contactPhone) }
        : {}),
    },
    include: listingInclude,
  });

  return toDto(updated);
}

/** Soft-delete an official listing (sellers remove their own from the app). */
export async function deleteOfficialListing(id: number): Promise<void> {
  const listing = await loadListing(id);
  if (!listing.isOfficial) {
    throw errors.badRequest('Only official listings can be deleted here. Reject it instead.');
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.communityPost.update({ where: { id }, data: { deletedAt: now } }),
    prisma.comment.updateMany({
      where: { postId: id, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
}
