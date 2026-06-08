import { Role } from '@nanny-app/shared';
import { CommunityPostType as PrismaCommunityPostType } from '@prisma/client';

import { AppError } from '@backend/lib/errors';
import {
  createPost,
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
  $transaction: jest.Mock;
};

const motherUser = {
  id: 'user-1',
  firebaseUid: 'firebase-1',
  role: Role.MOTHER,
  deletedAt: null,
  firstName: 'Jane',
  lastName: 'Doe',
  avatarUrl: null,
};

const decoded = { uid: 'firebase-1' } as import('@backend/lib/firebase').DecodedIdToken;

const samplePost = {
  id: 'post-1',
  authorId: 'user-1',
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

    const result = await togglePostLike(decoded, 'post-1');
    expect(result.liked).toBe(true);
    expect(result.likeCount).toBe(1);
  });

  it('rejects RSVP on non-event posts', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(samplePost as never);

    await expect(toggleEventRsvp(decoded, 'post-1')).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({
        statusCode: 400,
      }),
    );
  });
});
