import { CommunityPostType, PostModerationStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    communityPost: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import {
  approvePost,
  listCommunityPosts,
  rejectPost,
} from '@backend/services/admin-community.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};
const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

const ADMIN_UID = 'firebase-admin';
const ADMIN_ID = 3;
const author = { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    authorId: author.id,
    type: CommunityPostType.MARKETPLACE,
    title: 'Stroller',
    body: 'Barely used',
    imageUrls: ['https://cdn.example.com/stroller.jpg'],
    price: 1200,
    location: null,
    eventStartsAt: null,
    maxAttendees: null,
    rsvpCount: 0,
    tags: [],
    likeCount: 0,
    commentCount: 0,
    moderationStatus: PostModerationStatus.PENDING,
    rejectionReason: null,
    reviewedAt: null,
    reviewedById: null,
    isOfficial: false,
    contactPhone: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-08-01T10:00:00.000Z'),
    deletedAt: null,
    author,
    ...overrides,
  };
}

const eventPost = () =>
  makePost({
    id: 45,
    type: CommunityPostType.EVENT,
    title: 'Coffee morning',
    location: 'Maadi',
    eventStartsAt: new Date('2026-10-01T09:00:00.000Z'),
    price: null,
    imageUrls: [],
  });

const qaPost = () =>
  makePost({
    id: 46,
    type: CommunityPostType.QA,
    title: null,
    body: 'Where do I buy a pram in Cairo that is not overpriced?',
    price: null,
    imageUrls: [],
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('listCommunityPosts', () => {
  it('defaults to every type, pending, oldest submission first', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(1);
    mockPrisma.communityPost.findMany.mockResolvedValue([eventPost()]);

    const { posts, meta } = await listCommunityPosts({
      type: 'ALL',
      status: 'PENDING',
      page: 1,
      limit: 20,
    });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, moderationStatus: 'PENDING' }),
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ type: expect.anything() }),
      }),
    );
    expect(posts[0]).toMatchObject({
      type: 'event',
      location: 'Maadi',
      eventStartsAt: '2026-10-01T09:00:00.000Z',
      moderationStatus: 'pending',
      author: { name: 'Jane Doe' },
    });
    expect(meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('narrows to one type and drops the status filter for ALL', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(0);
    mockPrisma.communityPost.findMany.mockResolvedValue([]);

    await listCommunityPosts({ type: 'QA', status: 'ALL', page: 1, limit: 20 });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: CommunityPostType.QA }),
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ moderationStatus: expect.anything() }),
      }),
    );
  });
});

describe('approvePost', () => {
  it('publishes the post, stamps the reviewer and notifies the author with event copy', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(eventPost());
    mockPrisma.communityPost.update.mockResolvedValue({
      ...eventPost(),
      moderationStatus: PostModerationStatus.APPROVED,
    });

    const result = await approvePost(45, ADMIN_UID);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PostModerationStatus.APPROVED,
          rejectionReason: null,
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.moderationStatus).toBe('approved');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: author.id,
        type: 'MARKETPLACE_LISTING_APPROVED',
        title: 'Your event is live',
        referenceId: 45,
        referenceType: 'COMMUNITY_POST',
      }),
    );
    expect(mockPush).toHaveBeenCalled();
  });

  it('keeps the listing wording for a marketplace post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    mockPrisma.communityPost.update.mockResolvedValue(
      makePost({ moderationStatus: PostModerationStatus.APPROVED }),
    );

    await approvePost(44, ADMIN_UID);

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Your listing is live' }),
    );
  });

  it('is idempotent on an already-approved post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      makePost({ moderationStatus: PostModerationStatus.APPROVED }),
    );

    const result = await approvePost(44, ADMIN_UID);

    expect(result.moderationStatus).toBe('approved');
    expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('refuses a non-admin caller', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(approvePost(44, 'firebase-mother')).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 403 }),
    );
  });

  it('404s on a post that does not exist', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(null);

    await expect(approvePost(999, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
});

describe('rejectPost', () => {
  it('stores the reason and tells the author what to fix, naming a Q&A post by its question', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(qaPost());
    mockPrisma.communityPost.update.mockResolvedValue({
      ...qaPost(),
      moderationStatus: PostModerationStatus.REJECTED,
      rejectionReason: 'Please keep it on topic',
    });

    const result = await rejectPost(46, { reason: 'Please keep it on topic' }, ADMIN_UID);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PostModerationStatus.REJECTED,
          rejectionReason: 'Please keep it on topic',
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.rejectionReason).toBe('Please keep it on topic');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MARKETPLACE_LISTING_REJECTED',
        title: 'Your post needs changes',
        // The 40-character excerpt, not the whole question.
        body: expect.stringContaining('"Where do I buy a pram in Cairo that is n…"'),
      }),
    );
  });

  it('takes down an already-approved post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      makePost({ moderationStatus: PostModerationStatus.APPROVED }),
    );
    mockPrisma.communityPost.update.mockResolvedValue(
      makePost({
        moderationStatus: PostModerationStatus.REJECTED,
        rejectionReason: 'Prohibited item',
      }),
    );

    const result = await rejectPost(44, { reason: 'Prohibited item' }, ADMIN_UID);

    expect(result.moderationStatus).toBe('rejected');
  });

  it('refuses to reject an official listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost({ isOfficial: true }));

    await expect(rejectPost(44, { reason: 'nope' }, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });
});
