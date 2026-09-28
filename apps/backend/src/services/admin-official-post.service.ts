import { CommunityPostType, PostModerationStatus, Prisma } from '@prisma/client';

import {
  normalizePhone,
  type AdminCommunityPost,
  type CreateOfficialPostInput,
  type UpdateOfficialPostInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { wallClockToUtc } from '@backend/lib/platform-time';
import {
  communityPostInclude,
  resolveAdminId,
  toAdminCommunityPost,
  type CommunityPostRow,
} from '@backend/services/admin-community.service';

// Official posts: events, Q&A and listings published as NannyNow. They skip
// review and can be edited or deleted only here. Moderating members' posts
// lives in admin-community.service.

/** Fields each type refuses on an edit; everything else is shared. */
const FOREIGN_FIELDS: Record<CommunityPostType, (keyof UpdateOfficialPostInput)[]> = {
  [CommunityPostType.MARKETPLACE]: ['eventStartsAt', 'location', 'maxAttendees'],
  [CommunityPostType.EVENT]: ['contactPhone'],
  [CommunityPostType.QA]: ['contactPhone', 'eventStartsAt', 'location', 'maxAttendees', 'price'],
};

async function loadPost(id: number): Promise<CommunityPostRow> {
  const post = await prisma.communityPost.findFirst({
    where: { id, deletedAt: null },
    include: communityPostInclude,
  });
  if (!post) throw errors.notFound('Post not found.');
  return post;
}

type TypedCreateFields = Pick<
  Prisma.CommunityPostUncheckedCreateInput,
  'type' | 'title' | 'price' | 'contactPhone' | 'eventStartsAt' | 'location' | 'maxAttendees'
>;

function typedCreateFields(input: CreateOfficialPostInput): TypedCreateFields {
  switch (input.type) {
    case 'marketplace':
      return {
        type: CommunityPostType.MARKETPLACE,
        title: input.title,
        price: new Prisma.Decimal(input.price),
        contactPhone: normalizePhone(input.contactPhone),
      };
    case 'event':
      return {
        type: CommunityPostType.EVENT,
        title: input.title,
        eventStartsAt: wallClockToUtc(input.eventStartsAt),
        location: input.location,
        price: input.price !== undefined ? new Prisma.Decimal(input.price) : null,
        maxAttendees: input.maxAttendees ?? null,
      };
    case 'qa':
      return { type: CommunityPostType.QA, title: input.title ?? null };
  }
}

/**
 * Publish an official post, authored by the acting admin and approved on
 * creation. A listing is pinned above seller listings in the marketplace feed;
 * an event or Q&A sits in its feed by date like any post, badged Official.
 */
export async function createOfficialPost(
  input: CreateOfficialPostInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);

  const data: Prisma.CommunityPostUncheckedCreateInput = {
    ...typedCreateFields(input),
    authorId: adminId,
    body: input.body ?? null,
    imageUrls: input.imageUrls,
    tags: input.tags,
    isOfficial: true,
    moderationStatus: PostModerationStatus.APPROVED,
    reviewedAt: new Date(),
    reviewedById: adminId,
  };

  const created = await prisma.communityPost.create({ data, include: communityPostInclude });
  return toAdminCommunityPost(created);
}

/** The fields each type can't do without, checked against an edit. */
function assertStillComplete(type: CommunityPostType, input: UpdateOfficialPostInput): void {
  if (type === CommunityPostType.MARKETPLACE) {
    if (input.title === null) throw errors.badRequest('A listing needs a product name.');
    if (input.price !== undefined && (input.price === null || input.price <= 0)) {
      throw errors.badRequest('Price must be greater than 0.');
    }
    if (input.imageUrls !== undefined && input.imageUrls.length === 0) {
      throw errors.badRequest('At least one image is required.');
    }
  }
  if (type === CommunityPostType.EVENT && input.title === null) {
    throw errors.badRequest('An event needs a name.');
  }
  if (type === CommunityPostType.QA && input.body === null) {
    throw errors.badRequest('A question needs a body.');
  }
}

/** Edit an official post. Never re-enters review — an admin authored it. */
export async function updateOfficialPost(
  id: number,
  input: UpdateOfficialPostInput,
): Promise<AdminCommunityPost> {
  const post = await loadPost(id);
  if (!post.isOfficial) throw errors.badRequest('Only official posts can be edited here.');
  if (FOREIGN_FIELDS[post.type].some((field) => input[field] !== undefined)) {
    throw errors.badRequest("That field doesn't apply to this kind of post.");
  }
  assertStillComplete(post.type, input);

  const data: Prisma.CommunityPostUncheckedUpdateInput = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.imageUrls !== undefined ? { imageUrls: input.imageUrls } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.price !== undefined
      ? { price: input.price === null ? null : new Prisma.Decimal(input.price) }
      : {}),
    ...(input.contactPhone !== undefined
      ? { contactPhone: normalizePhone(input.contactPhone) }
      : {}),
    ...(input.eventStartsAt !== undefined
      ? { eventStartsAt: wallClockToUtc(input.eventStartsAt) }
      : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.maxAttendees !== undefined ? { maxAttendees: input.maxAttendees } : {}),
  };

  const updated = await prisma.communityPost.update({
    where: { id },
    data,
    include: communityPostInclude,
  });
  return toAdminCommunityPost(updated);
}

/** Soft-delete an official post and its comments (members remove their own in the app). */
export async function deleteOfficialPost(id: number): Promise<void> {
  const post = await loadPost(id);
  if (!post.isOfficial) {
    throw errors.badRequest('Only official posts can be deleted here. Reject it instead.');
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
