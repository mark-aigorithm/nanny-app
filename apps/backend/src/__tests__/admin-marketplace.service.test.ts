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
  createOfficialListing,
  deleteOfficialListing,
  updateOfficialListing,
} from '@backend/services/admin-marketplace.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  comment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;

const ADMIN_UID = 'firebase-admin';
const ADMIN_ID = 3;

const seller = { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null };

function makeListing(overrides: Record<string, unknown> = {}) {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findFirst.mockResolvedValue({ id: ADMIN_ID });
  mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('createOfficialListing', () => {
  it('publishes an approved, pinned listing authored by the admin', async () => {
    mockPrisma.communityPost.create.mockResolvedValue(
      makeListing({
        authorId: ADMIN_ID,
        isOfficial: true,
        moderationStatus: PostModerationStatus.APPROVED,
        contactPhone: '+201001234567',
      }),
    );

    const result = await createOfficialListing(
      {
        title: 'Convertible car seat',
        price: 3500,
        imageUrls: ['https://cdn.example.com/seat.jpg'],
        tags: [],
        // Deliberately unformatted — the service normalises before storing.
        contactPhone: '+20 (100) 123.4567',
      },
      ADMIN_UID,
    );

    expect(mockPrisma.communityPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: ADMIN_ID,
          type: CommunityPostType.MARKETPLACE,
          isOfficial: true,
          moderationStatus: PostModerationStatus.APPROVED,
          contactPhone: '+201001234567',
        }),
      }),
    );
    expect(result.isOfficial).toBe(true);
    // The admin is the author — nobody to notify.
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('updateOfficialListing / deleteOfficialListing', () => {
  it('rejects editing a seller listing through the official endpoint', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing());

    await expect(updateOfficialListing(44, { price: 10 })).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });

  it('soft-deletes an official listing and its comments', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing({ isOfficial: true }));

    await deleteOfficialListing(44);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(mockPrisma.comment.updateMany).toHaveBeenCalled();
  });

  it('refuses to delete a seller listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing());

    await expect(deleteOfficialListing(44)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });
});
