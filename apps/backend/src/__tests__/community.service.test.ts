import { Role } from '@nanny-app/shared';
import { CommunityPostType as PrismaCommunityPostType } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import {
  createPost,
  getPost,
  listComments,
  listPosts,
  toggleEventRsvp,
  togglePostLike,
} from '@backend/services/community.service';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    communityPost: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    postLike: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventRsvp: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    commentLike: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@backend/db/prisma';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  communityPost: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findUnique: jest.Mock;
  };
  postLike: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  eventRsvp: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  comment: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  commentLike: {
    findMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const motherUser = {
  id: 29,
  firebaseUid: 'firebase-1',
  role: Role.MOTHER,
  deletedAt: null,
  firstName: 'Jane',
  lastName: 'Doe',
  avatarUrl: null,
};

const decoded = { uid: 'firebase-1' } as import('@backend/lib/firebase').DecodedIdToken;

const samplePost = {
  id: 22,
  authorId: 29,
  type: PrismaCommunityPostType.QA,
  title: null,
  body: 'Hello community',
  imageUrls: [],
  price: null,
  location: null,
  eventStartsAt: null,
  maxAttendees: null,
  rsvpCount: 0,
  tags: ['Parenting'],
  likeCount: 0,
  commentCount: 0,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  updatedAt: new Date('2026-01-01T12:00:00Z'),
  deletedAt: null,
  author: motherUser,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(motherUser as never);
});

describe('community.service', () => {
  it('forbids non-mothers from listing posts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...motherUser,
      role: Role.NANNY,
    } as never);

    await expect(listPosts(decoded, { page: 1, limit: 20 })).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({
        statusCode: 403,
      }),
    );
  });

  it('creates a QA post', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(samplePost as never);

    const result = await createPost(decoded, {
      type: 'qa',
      body: 'Hello community',
      tags: ['Parenting'],
      imageUrls: [],
    });

    expect(result.type).toBe('qa');
    expect(result.body).toBe('Hello community');
    expect(mockPrisma.communityPost.create).toHaveBeenCalled();
  });

  it('lists posts anonymously (guest) without a user lookup and with engagement flags false', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(1);
    mockPrisma.communityPost.findMany.mockResolvedValue([samplePost] as never);

    const result = await listPosts(null, { page: 1, limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.likedByMe).toBe(false);
    expect(result.posts[0]?.rsvpdByMe).toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.postLike.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.eventRsvp.findMany).not.toHaveBeenCalled();
  });

  it('gets a post anonymously (guest) with engagement flags false', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);

    const result = await getPost(null, 22);

    expect(result.id).toBe(22);
    expect(result.likedByMe).toBe(false);
    expect(result.rsvpdByMe).toBe(false);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.postLike.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.eventRsvp.findFirst).not.toHaveBeenCalled();
  });

  it('lists comments anonymously (guest) without a like lookup', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);
    mockPrisma.comment.count.mockResolvedValue(1);
    mockPrisma.comment.findMany.mockResolvedValue([
      {
        id: 7,
        postId: 22,
        parentCommentId: null,
        body: 'Welcome!',
        likeCount: 0,
        createdAt: new Date('2026-01-02T12:00:00Z'),
        updatedAt: new Date('2026-01-02T12:00:00Z'),
        deletedAt: null,
        author: motherUser,
        replies: [],
      },
    ] as never);

    const result = await listComments(null, 22, { page: 1, limit: 20 });

    expect(result.comments).toHaveLength(1);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.commentLike.findMany).not.toHaveBeenCalled();
  });

  it('still forbids signed-in nannies from reading the feed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...motherUser,
      role: Role.NANNY,
    } as never);

    await expect(getPost(decoded, 22)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({
        statusCode: 403,
      }),
    );
  });

  it('lists posts with pagination meta', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(1);
    mockPrisma.communityPost.findMany.mockResolvedValue([samplePost] as never);
    mockPrisma.postLike.findMany.mockResolvedValue([]);
    mockPrisma.eventRsvp.findMany.mockResolvedValue([]);

    const result = await listPosts(decoded, { page: 1, limit: 20 });

    expect(result.posts).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.totalPages).toBe(1);
  });

  it('toggles post like and updates count', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        postLike: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null),
          create: jest.fn(),
          update: jest.fn(),
        },
        communityPost: {
          update: jest.fn().mockResolvedValue({ ...samplePost, likeCount: 1 }),
        },
      };
      return fn(tx as never);
    });

    const result = await togglePostLike(decoded, 22);
    expect(result.liked).toBe(true);
    expect(result.likeCount).toBe(1);
  });

  it('rejects RSVP on non-event posts', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);

    await expect(toggleEventRsvp(decoded, 22)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({
        statusCode: 400,
      }),
    );
  });
});
