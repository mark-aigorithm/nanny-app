import { CommunityPostType, PostModerationStatus, Prisma } from '@prisma/client';

import {
  normalizePhone,
  type AdminCommunityPost,
  type CreateOfficialListingInput,
  type UpdateOfficialListingInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  communityPostInclude,
  resolveAdminId,
  toAdminCommunityPost,
  type CommunityPostRow,
} from '@backend/services/admin-community.service';

// Official ("Sold by NannyNow") listings. Moderation of members' posts — every
// type — lives in admin-community.service.

async function loadListing(id: number): Promise<CommunityPostRow> {
  const listing = await prisma.communityPost.findFirst({
    where: { id, type: CommunityPostType.MARKETPLACE, deletedAt: null },
    include: communityPostInclude,
  });
  if (!listing) throw errors.notFound('Listing not found.');
  return listing;
}

/**
 * Publish an official ("Sold by NannyNow") listing. Authored by the acting
 * admin, approved on creation, and pinned above seller listings in the feed.
 */
export async function createOfficialListing(
  input: CreateOfficialListingInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
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
    include: communityPostInclude,
  });

  return toAdminCommunityPost(created);
}

/** Edit an official listing. Never re-enters review — an admin authored it. */
export async function updateOfficialListing(
  id: number,
  input: UpdateOfficialListingInput,
): Promise<AdminCommunityPost> {
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
    include: communityPostInclude,
  });

  return toAdminCommunityPost(updated);
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
