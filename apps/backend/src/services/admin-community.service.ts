import {
  CommunityPostType,
  NotificationReferenceType,
  PostModerationStatus,
  Prisma,
} from '@prisma/client';

import type {
  AdminCommunityPost,
  AdminCommunityPostListQuery,
  PaginationMeta,
  RejectPostInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

export const communityPostInclude = {
  author: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
} satisfies Prisma.CommunityPostInclude;

export type CommunityPostRow = Prisma.CommunityPostGetPayload<{
  include: typeof communityPostInclude;
}>;

function toApiType(type: CommunityPostType): AdminCommunityPost['type'] {
  switch (type) {
    case CommunityPostType.MARKETPLACE:
      return 'marketplace';
    case CommunityPostType.EVENT:
      return 'event';
    default:
      return 'qa';
  }
}

function toApiStatus(status: PostModerationStatus): AdminCommunityPost['moderationStatus'] {
  switch (status) {
    case PostModerationStatus.PENDING:
      return 'pending';
    case PostModerationStatus.REJECTED:
      return 'rejected';
    default:
      return 'approved';
  }
}

export function toAdminCommunityPost(row: CommunityPostRow): AdminCommunityPost {
  return {
    id: row.id,
    type: toApiType(row.type),
    title: row.title,
    body: row.body,
    price: row.price !== null ? Number(row.price) : null,
    imageUrls: row.imageUrls,
    tags: row.tags,
    location: row.location,
    eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
    maxAttendees: row.maxAttendees,
    rsvpCount: row.rsvpCount,
    moderationStatus: toApiStatus(row.moderationStatus),
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    isOfficial: row.isOfficial,
    contactPhone: row.contactPhone,
    author: {
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
export async function resolveAdminId(adminFirebaseUid: string): Promise<number> {
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

async function loadPost(id: number): Promise<CommunityPostRow> {
  const post = await prisma.communityPost.findFirst({
    where: { id, deletedAt: null },
    include: communityPostInclude,
  });
  if (!post) throw errors.notFound('Post not found.');
  return post;
}

const EXCERPT_LENGTH = 40;

/**
 * How the author's notification refers to the post: the noun matches the type
 * (the marketplace wording is pinned by the mobile E2E suite), and a Q&A post
 * with no headline is named by the start of its question.
 */
function describePost(post: CommunityPostRow): { noun: string; name: string } {
  const noun =
    post.type === CommunityPostType.MARKETPLACE
      ? 'listing'
      : post.type === CommunityPostType.EVENT
        ? 'event'
        : 'post';
  const excerpt =
    post.body && post.body.length > EXCERPT_LENGTH
      ? `${post.body.slice(0, EXCERPT_LENGTH).trimEnd()}…`
      : post.body;
  return { noun, name: post.title ?? excerpt ?? `Your ${noun}` };
}

/**
 * Tell the author what happened to her post. Skipped for official listings,
 * where the admin is the author and would be notifying himself.
 */
async function notifyAuthor(
  post: CommunityPostRow,
  approved: boolean,
  reason?: string,
): Promise<void> {
  if (post.isOfficial) return;

  const { noun, name } = describePost(post);
  const title = approved ? `Your ${noun} is live` : `Your ${noun} needs changes`;
  const body = approved
    ? `"${name}" was approved and is now in the community.`
    : `"${name}" was not approved: ${reason ?? 'please review it and resubmit.'}`;

  await createInAppNotification({
    userId: post.authorId,
    type: approved ? 'MARKETPLACE_LISTING_APPROVED' : 'MARKETPLACE_LISTING_REJECTED',
    title,
    body,
    referenceId: post.id,
    referenceType: NotificationReferenceType.COMMUNITY_POST,
  });
  await dispatchPush(post.authorId, {
    title,
    body,
    data: {
      type: approved ? 'marketplace_listing_approved' : 'marketplace_listing_rejected',
      postId: String(post.id),
    },
  });
}

/**
 * The moderation queue across every post type. Defaults (via the query
 * schema) to PENDING — the posts actually waiting on an admin — with the
 * oldest submission first so authors are served in the order they posted.
 */
export async function listCommunityPosts({
  type,
  status,
  page,
  limit,
}: AdminCommunityPostListQuery): Promise<{ posts: AdminCommunityPost[]; meta: PaginationMeta }> {
  const where: Prisma.CommunityPostWhereInput = {
    deletedAt: null,
    ...(type !== 'ALL' ? { type: type as CommunityPostType } : {}),
    ...(status !== 'ALL' ? { moderationStatus: status as PostModerationStatus } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.communityPost.count({ where }),
    prisma.communityPost.findMany({
      where,
      include: communityPostInclude,
      orderBy:
        status === 'PENDING'
          ? { createdAt: 'asc' }
          : [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    posts: rows.map(toAdminCommunityPost),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/** Publish a post. Idempotent — approving an approved post is a no-op. */
export async function approvePost(
  id: number,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const post = await loadPost(id);

  if (post.moderationStatus === PostModerationStatus.APPROVED) {
    return toAdminCommunityPost(post);
  }

  const updated = await prisma.communityPost.update({
    where: { id },
    data: {
      moderationStatus: PostModerationStatus.APPROVED,
      rejectionReason: null,
      reviewedAt: new Date(),
      reviewedById: adminId,
    },
    include: communityPostInclude,
  });

  await notifyAuthor(updated, true);
  return toAdminCommunityPost(updated);
}

/**
 * Reject a post with a reason the author sees in "My posts". Also serves as a
 * takedown: an already-approved post can be rejected, which pulls it straight
 * out of the feed.
 */
export async function rejectPost(
  id: number,
  input: RejectPostInput,
  adminFirebaseUid: string,
): Promise<AdminCommunityPost> {
  const adminId = await resolveAdminId(adminFirebaseUid);
  const post = await loadPost(id);

  if (post.isOfficial) {
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
    include: communityPostInclude,
  });

  await notifyAuthor(updated, false, input.reason);
  return toAdminCommunityPost(updated);
}
