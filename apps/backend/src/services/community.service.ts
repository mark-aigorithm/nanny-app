import {
  CommunityPostType,
  Role,
  type CommentListQuery,
  type CommentListResponse,
  type CommentResponse,
  type CommunityFeedQuery,
  type CommunityFeedResponse,
  type CommunityPostResponse,
  type CreateCommentRequest,
  type CreateCommunityPostRequest,
  type PaginationMeta,
  type ToggleLikeResponse,
  type ToggleRsvpResponse,
  type UpdateCommunityPostRequest,
} from '@nanny-app/shared';
import {
  CommunityPostType as PrismaCommunityPostType,
  Prisma,
  type User,
} from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';

const postInclude = {
  author: true,
} as const;

type PostWithAuthor = Prisma.CommunityPostGetPayload<{ include: typeof postInclude }>;

const MAX_REPLIES_PER_COMMENT = 20;

function toApiPostType(type: PrismaCommunityPostType): CommunityPostType {
  switch (type) {
    case PrismaCommunityPostType.QA:
      return 'qa';
    case PrismaCommunityPostType.MARKETPLACE:
      return 'marketplace';
    case PrismaCommunityPostType.EVENT:
      return 'event';
    default:
      return 'qa';
  }
}

function toPrismaPostType(type: CommunityPostType): PrismaCommunityPostType {
  switch (type) {
    case 'qa':
      return PrismaCommunityPostType.QA;
    case 'marketplace':
      return PrismaCommunityPostType.MARKETPLACE;
    case 'event':
      return PrismaCommunityPostType.EVENT;
  }
}

async function getUserByUid(uid: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: uid } });
  if (!user || user.deletedAt) throw errors.unauthorized();
  return user;
}

function requireMother(user: User): void {
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Only mothers can use community features.');
  }
}

function toAuthor(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
  };
}

function toPostResponse(
  post: PostWithAuthor,
  likedByMe: boolean,
  rsvpdByMe: boolean,
): CommunityPostResponse {
  return {
    id: post.id,
    type: toApiPostType(post.type),
    title: post.title,
    body: post.body,
    imageUrls: post.imageUrls,
    price: post.price !== null ? Number(post.price) : null,
    location: post.location,
    eventStartsAt: post.eventStartsAt?.toISOString() ?? null,
    maxAttendees: post.maxAttendees,
    rsvpCount: post.rsvpCount,
    tags: post.tags,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe,
    rsvpdByMe,
    author: toAuthor(post.author),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

async function loadPostOrThrow(postId: string): Promise<PostWithAuthor> {
  const post = await prisma.communityPost.findFirst({
    where: { id: postId, deletedAt: null },
    include: postInclude,
  });
  if (!post) throw errors.notFound('Post not found.');
  return post;
}

async function getEngagementFlags(userId: string, postId: string) {
  const [like, rsvp] = await Promise.all([
    prisma.postLike.findFirst({
      where: { postId, userId, deletedAt: null },
    }),
    prisma.eventRsvp.findFirst({
      where: { postId, userId, deletedAt: null },
    }),
  ]);
  return { likedByMe: !!like, rsvpdByMe: !!rsvp };
}

function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

function mapCreateInput(body: CreateCommunityPostRequest, authorId: string) {
  const base = {
    authorId,
    type: toPrismaPostType(body.type),
    tags: body.tags ?? [],
    imageUrls: body.imageUrls ?? [],
  };

  switch (body.type) {
    case 'qa':
      return {
        ...base,
        title: body.title ?? null,
        body: body.body,
      };
    case 'marketplace':
      return {
        ...base,
        title: body.title,
        body: body.body ?? null,
        price: new Prisma.Decimal(body.price),
        imageUrls: body.imageUrls,
      };
    case 'event':
      return {
        ...base,
        title: body.title,
        body: body.body ?? null,
        location: body.location,
        eventStartsAt: new Date(body.eventStartsAt),
        price: body.price !== undefined ? new Prisma.Decimal(body.price) : null,
        maxAttendees: body.maxAttendees ?? null,
      };
  }
}

/**
 * Resolves the reading user for feed endpoints. `null` means an anonymous
 * guest browsing the public feed — allowed for reads, with all `…ByMe`
 * engagement flags reported as false. Signed-in readers must still be mothers.
 */
async function getFeedReader(decoded: DecodedIdToken | null): Promise<User | null> {
  if (!decoded) return null;
  const user = await getUserByUid(decoded.uid);
  requireMother(user);
  return user;
}

export async function listPosts(
  decoded: DecodedIdToken | null,
  query: CommunityFeedQuery,
): Promise<CommunityFeedResponse> {
  const user = await getFeedReader(decoded);

  const { page, limit, type, tag } = query;
  const where: Prisma.CommunityPostWhereInput = {
    deletedAt: null,
    ...(type ? { type: toPrismaPostType(type) } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.communityPost.count({ where }),
    prisma.communityPost.findMany({
      where,
      include: postInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const postIds = rows.map((p) => p.id);
  const [likes, rsvps] = user
    ? await Promise.all([
        prisma.postLike.findMany({
          where: { postId: { in: postIds }, userId: user.id, deletedAt: null },
          select: { postId: true },
        }),
        prisma.eventRsvp.findMany({
          where: { postId: { in: postIds }, userId: user.id, deletedAt: null },
          select: { postId: true },
        }),
      ])
    : [[], []];

  const likedSet = new Set(likes.map((l) => l.postId));
  const rsvpdSet = new Set(rsvps.map((r) => r.postId));

  return {
    posts: rows.map((post) =>
      toPostResponse(post, likedSet.has(post.id), rsvpdSet.has(post.id)),
    ),
    meta: buildPaginationMeta(page, limit, total),
  };
}

export async function getPost(
  decoded: DecodedIdToken | null,
  postId: string,
): Promise<CommunityPostResponse> {
  const user = await getFeedReader(decoded);

  const post = await loadPostOrThrow(postId);
  const flags = user
    ? await getEngagementFlags(user.id, postId)
    : { likedByMe: false, rsvpdByMe: false };
  return toPostResponse(post, flags.likedByMe, flags.rsvpdByMe);
}

export async function createPost(
  decoded: DecodedIdToken,
  body: CreateCommunityPostRequest,
): Promise<CommunityPostResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const post = await prisma.communityPost.create({
    data: mapCreateInput(body, user.id),
    include: postInclude,
  });

  return toPostResponse(post, false, false);
}

export async function updatePost(
  decoded: DecodedIdToken,
  postId: string,
  body: UpdateCommunityPostRequest,
): Promise<CommunityPostResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const existing = await loadPostOrThrow(postId);
  if (existing.authorId !== user.id) {
    throw errors.forbidden('You can only edit your own posts.');
  }

  const post = await prisma.communityPost.update({
    where: { id: postId },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.imageUrls !== undefined ? { imageUrls: body.imageUrls } : {}),
      ...(body.price !== undefined ? { price: new Prisma.Decimal(body.price) } : {}),
      ...(body.location !== undefined ? { location: body.location } : {}),
      ...(body.eventStartsAt !== undefined
        ? { eventStartsAt: new Date(body.eventStartsAt) }
        : {}),
      ...(body.maxAttendees !== undefined ? { maxAttendees: body.maxAttendees } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
    },
    include: postInclude,
  });

  const flags = await getEngagementFlags(user.id, postId);
  return toPostResponse(post, flags.likedByMe, flags.rsvpdByMe);
}

export async function deletePost(decoded: DecodedIdToken, postId: string): Promise<void> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const existing = await loadPostOrThrow(postId);
  if (existing.authorId !== user.id) {
    throw errors.forbidden('You can only delete your own posts.');
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.communityPost.update({
      where: { id: postId },
      data: { deletedAt: now },
    }),
    prisma.comment.updateMany({
      where: { postId, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);
}

export async function togglePostLike(
  decoded: DecodedIdToken,
  postId: string,
): Promise<ToggleLikeResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);
  await loadPostOrThrow(postId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.postLike.findFirst({
      where: { postId, userId: user.id, deletedAt: null },
    });

    if (existing) {
      await tx.postLike.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      const post = await tx.communityPost.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false, likeCount: Math.max(0, post.likeCount) };
    }

    const restored = await tx.postLike.findFirst({
      where: { postId, userId: user.id },
    });

    if (restored?.deletedAt) {
      await tx.postLike.update({
        where: { id: restored.id },
        data: { deletedAt: null },
      });
    } else if (!restored) {
      await tx.postLike.create({
        data: { postId, userId: user.id },
      });
    }

    const post = await tx.communityPost.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    });
    return { liked: true, likeCount: post.likeCount };
  });
}

type CommentWithReplies = Prisma.CommentGetPayload<{
  include: { author: true; replies: { include: { author: true } } };
}>;

function toCommentResponse(comment: CommentWithReplies, likedCommentIds: Set<string>): CommentResponse {
  return {
    id: comment.id,
    postId: comment.postId,
    body: comment.body,
    likeCount: comment.likeCount,
    likedByMe: likedCommentIds.has(comment.id),
    author: toAuthor(comment.author),
    parentCommentId: comment.parentCommentId,
    replies: (comment.replies ?? [])
      .filter((r) => !r.deletedAt)
      .slice(0, MAX_REPLIES_PER_COMMENT)
      .map((reply) => ({
        id: reply.id,
        postId: reply.postId,
        body: reply.body,
        likeCount: reply.likeCount,
        likedByMe: likedCommentIds.has(reply.id),
        author: toAuthor(reply.author),
        parentCommentId: reply.parentCommentId,
        replies: [],
        createdAt: reply.createdAt.toISOString(),
        updatedAt: reply.updatedAt.toISOString(),
      })),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export async function listComments(
  decoded: DecodedIdToken | null,
  postId: string,
  query: CommentListQuery,
): Promise<CommentListResponse> {
  const user = await getFeedReader(decoded);
  await loadPostOrThrow(postId);

  const { page, limit } = query;
  const where: Prisma.CommentWhereInput = {
    postId,
    parentCommentId: null,
    deletedAt: null,
  };

  const [total, rows] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.findMany({
      where,
      include: {
        author: true,
        replies: {
          where: { deletedAt: null },
          include: { author: true },
          orderBy: { createdAt: 'asc' },
          take: MAX_REPLIES_PER_COMMENT,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const commentIds = [
    ...rows.map((c) => c.id),
    ...rows.flatMap((c) => c.replies.map((r) => r.id)),
  ];

  const likes = user && commentIds.length
    ? await prisma.commentLike.findMany({
        where: { commentId: { in: commentIds }, userId: user.id, deletedAt: null },
        select: { commentId: true },
      })
    : [];

  const likedSet = new Set(likes.map((l) => l.commentId));

  return {
    comments: rows.map((c) => toCommentResponse(c, likedSet)),
    meta: buildPaginationMeta(page, limit, total),
  };
}

export async function createComment(
  decoded: DecodedIdToken,
  postId: string,
  body: CreateCommentRequest,
): Promise<CommentResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);
  await loadPostOrThrow(postId);

  if (body.parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: {
        id: body.parentCommentId,
        postId,
        deletedAt: null,
      },
    });
    if (!parent) throw errors.notFound('Parent comment not found.');
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        postId,
        authorId: user.id,
        body: body.body,
        parentCommentId: body.parentCommentId ?? null,
      },
      include: { author: true, replies: { include: { author: true } } },
    });
    await tx.communityPost.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });
    return created;
  });

  return toCommentResponse(comment, new Set());
}

export async function toggleCommentLike(
  decoded: DecodedIdToken,
  commentId: string,
): Promise<ToggleLikeResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
  });
  if (!comment) throw errors.notFound('Comment not found.');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.commentLike.findFirst({
      where: { commentId, userId: user.id, deletedAt: null },
    });

    if (existing) {
      await tx.commentLike.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false, likeCount: Math.max(0, updated.likeCount) };
    }

    const restored = await tx.commentLike.findFirst({
      where: { commentId, userId: user.id },
    });

    if (restored?.deletedAt) {
      await tx.commentLike.update({
        where: { id: restored.id },
        data: { deletedAt: null },
      });
    } else if (!restored) {
      await tx.commentLike.create({
        data: { commentId, userId: user.id },
      });
    }

    const updated = await tx.comment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    });
    return { liked: true, likeCount: updated.likeCount };
  });
}

export async function toggleEventRsvp(
  decoded: DecodedIdToken,
  postId: string,
): Promise<ToggleRsvpResponse> {
  const user = await getUserByUid(decoded.uid);
  requireMother(user);

  const post = await loadPostOrThrow(postId);
  if (post.type !== PrismaCommunityPostType.EVENT) {
    throw errors.badRequest('RSVP is only available for event posts.');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.eventRsvp.findFirst({
      where: { postId, userId: user.id, deletedAt: null },
    });

    if (existing) {
      await tx.eventRsvp.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });
      const updated = await tx.communityPost.update({
        where: { id: postId },
        data: { rsvpCount: { decrement: 1 } },
      });
      return { rsvpd: false, rsvpCount: Math.max(0, updated.rsvpCount) };
    }

    const current = await tx.communityPost.findUnique({ where: { id: postId } });
    if (
      current?.maxAttendees !== null &&
      current?.maxAttendees !== undefined &&
      current.rsvpCount >= current.maxAttendees
    ) {
      throw errors.conflict('This event is at capacity.');
    }

    const restored = await tx.eventRsvp.findFirst({
      where: { postId, userId: user.id },
    });

    if (restored?.deletedAt) {
      await tx.eventRsvp.update({
        where: { id: restored.id },
        data: { deletedAt: null },
      });
    } else if (!restored) {
      await tx.eventRsvp.create({
        data: { postId, userId: user.id },
      });
    }

    const updated = await tx.communityPost.update({
      where: { id: postId },
      data: { rsvpCount: { increment: 1 } },
    });
    return { rsvpd: true, rsvpCount: updated.rsvpCount };
  });
}
