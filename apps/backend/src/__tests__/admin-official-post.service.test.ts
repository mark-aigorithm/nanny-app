import { CommunityPostType, PostModerationStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    communityPost: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    comment: { updateMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

// admin-community.service (imported for the shared row mapping) pulls this in.
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import { createInAppNotification } from '@backend/services/notification.service';
import {
  createOfficialPost,
  deleteOfficialPost,
  updateOfficialPost,
} from '@backend/services/admin-official-post.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  comment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;

const ADMIN_UID = 'firebase-admin';
const ADMIN_ID = 3;

const seller = { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 44,
    authorId: seller.id,
    type: CommunityPostType.MARKETPLACE,
    title: 'Stroller',
    body: 'Barely used',
    price: 1200,
    imageUrls: ['https://cdn.example.com/stroller.jpg'],
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
    author: seller,
    ...overrides,
  };
}

/** An official post of `type`, as the admin created it. */
function official(type: CommunityPostType, overrides: Record<string, unknown> = {}) {
  return makePost({
    type,
    authorId: ADMIN_ID,
    isOfficial: true,
    moderationStatus: PostModerationStatus.APPROVED,
    ...overrides,
  });
}

/** The `data` the service handed to prisma.communityPost.create. */
function createdData(): Record<string, unknown> {
  return (mockPrisma.communityPost.create.mock.calls[0]?.[0] as { data: Record<string, unknown> })
    .data;
}

/** The `data` the service handed to prisma.communityPost.update. */
function updatedData(): Record<string, unknown> {
  return (mockPrisma.communityPost.update.mock.calls[0]?.[0] as { data: Record<string, unknown> })
    .data;
}

const badRequest = expect.objectContaining<Partial<AppError>>({ statusCode: 400 });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('createOfficialPost', () => {
  it('publishes a live, official listing with a normalised contact phone', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.MARKETPLACE));

    const result = await createOfficialPost(
      {
        type: 'marketplace',
        title: 'Convertible car seat',
        price: 3500,
        imageUrls: ['https://cdn.example.com/seat.jpg'],
        tags: [],
        // Deliberately unformatted — the service normalises before storing.
        contactPhone: '+20 (100) 123.4567',
      },
      ADMIN_UID,
    );

    expect(createdData()).toMatchObject({
      authorId: ADMIN_ID,
      type: CommunityPostType.MARKETPLACE,
      isOfficial: true,
      moderationStatus: PostModerationStatus.APPROVED,
      reviewedById: ADMIN_ID,
      contactPhone: '+201001234567',
    });
    expect(result.isOfficial).toBe(true);
    // The admin is the author — nobody to notify.
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('publishes an event, converting Cairo wall-clock to UTC and leaving it free', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.EVENT));

    await createOfficialPost(
      {
        type: 'event',
        title: 'Mommy & me picnic',
        eventStartsAt: '2026-01-15T18:00:00',
        location: 'Merryland Park',
        imageUrls: [],
        tags: [],
      },
      ADMIN_UID,
    );

    const data = createdData();
    expect(data).toMatchObject({
      type: CommunityPostType.EVENT,
      title: 'Mommy & me picnic',
      location: 'Merryland Park',
      isOfficial: true,
      moderationStatus: PostModerationStatus.APPROVED,
      price: null,
      maxAttendees: null,
    });
    // Cairo is UTC+2 in January.
    expect(data['eventStartsAt']).toEqual(new Date('2026-01-15T16:00:00.000Z'));
    expect(data['contactPhone']).toBeUndefined();
  });

  it('publishes a Q&A with no title', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(official(CommunityPostType.QA));

    await createOfficialPost(
      { type: 'qa', body: 'Summer hours start Sunday.', imageUrls: [], tags: [] },
      ADMIN_UID,
    );

    expect(createdData()).toMatchObject({
      type: CommunityPostType.QA,
      title: null,
      body: 'Summer hours start Sunday.',
      isOfficial: true,
    });
    expect(createdData()['contactPhone']).toBeUndefined();
  });
});

describe('updateOfficialPost', () => {
  it('refuses a field that belongs to another type', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.MARKETPLACE));
    await expect(updateOfficialPost(44, { location: 'Park' })).rejects.toEqual(badRequest);

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));
    await expect(updateOfficialPost(44, { contactPhone: '+201001234567' })).rejects.toEqual(
      badRequest,
    );

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.QA));
    await expect(updateOfficialPost(44, { price: 50 })).rejects.toEqual(badRequest);

    expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
  });

  it('keeps a listing priced and pictured', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.MARKETPLACE));
    await expect(updateOfficialPost(44, { price: 0 })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { price: null })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { imageUrls: [] })).rejects.toEqual(badRequest);
    await expect(updateOfficialPost(44, { title: null })).rejects.toEqual(badRequest);
  });

  it('keeps a Q&A body and an event name', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.QA));
    await expect(updateOfficialPost(44, { body: null })).rejects.toEqual(badRequest);

    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));
    await expect(updateOfficialPost(44, { title: null })).rejects.toEqual(badRequest);
  });

  it('makes an event free and uncapped again, and moves its time', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      official(CommunityPostType.EVENT, { price: 100, maxAttendees: 20 }),
    );
    mockPrisma.communityPost.update.mockResolvedValue(official(CommunityPostType.EVENT));

    await updateOfficialPost(44, {
      price: null,
      maxAttendees: null,
      eventStartsAt: '2026-01-20T10:30:00',
    });

    expect(updatedData()).toEqual({
      price: null,
      maxAttendees: null,
      eventStartsAt: new Date('2026-01-20T08:30:00.000Z'),
    });
  });

  it('refuses to edit a member’s post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    await expect(updateOfficialPost(44, { title: 'Changed' })).rejects.toEqual(badRequest);
  });

  it('answers 404 for a missing post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(null);
    await expect(updateOfficialPost(44, { title: 'Changed' })).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
});

describe('deleteOfficialPost', () => {
  it('soft-deletes an official event and its comments', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(official(CommunityPostType.EVENT));

    await deleteOfficialPost(44);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(mockPrisma.comment.updateMany).toHaveBeenCalled();
  });

  it('refuses to delete a member’s post', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makePost());
    await expect(deleteOfficialPost(44)).rejects.toEqual(badRequest);
  });
});
