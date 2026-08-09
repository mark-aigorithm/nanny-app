import { CommunityPostType, PostModerationStatus } from '@prisma/client';

import { AppError } from '@backend/lib/errors';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findFirst: jest.fn() },
    communityPost: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    comment: { updateMany: jest.fn() },
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
  approveListing,
  createOfficialListing,
  deleteOfficialListing,
  listMarketplaceListings,
  rejectListing,
  updateOfficialListing,
} from '@backend/services/admin-marketplace.service';

const mockPrisma = prisma as unknown as {
  user: { findFirst: jest.Mock };
  communityPost: {
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  comment: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

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
    tags: [],
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

describe('listMarketplaceListings', () => {
  it('defaults the queue to pending, oldest submission first', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(1);
    mockPrisma.communityPost.findMany.mockResolvedValue([makeListing()]);

    const { listings, meta } = await listMarketplaceListings('PENDING', { page: 1, limit: 20 });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: CommunityPostType.MARKETPLACE,
          moderationStatus: 'PENDING',
        }),
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(listings[0]?.moderationStatus).toBe('pending');
    expect(listings[0]?.seller.name).toBe('Jane Doe');
    expect(meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('drops the status filter for ALL', async () => {
    mockPrisma.communityPost.count.mockResolvedValue(0);
    mockPrisma.communityPost.findMany.mockResolvedValue([]);

    await listMarketplaceListings('ALL', { page: 1, limit: 20 });

    expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ moderationStatus: expect.anything() }),
      }),
    );
  });
});

describe('approveListing', () => {
  it('publishes the listing, stamps the reviewer and notifies the seller', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing());
    mockPrisma.communityPost.update.mockResolvedValue(
      makeListing({ moderationStatus: PostModerationStatus.APPROVED }),
    );

    const result = await approveListing(44, ADMIN_UID);

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
        userId: seller.id,
        type: 'MARKETPLACE_LISTING_APPROVED',
        referenceId: 44,
        referenceType: 'COMMUNITY_POST',
      }),
    );
    expect(mockPush).toHaveBeenCalled();
  });

  it('is idempotent on an already-approved listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      makeListing({ moderationStatus: PostModerationStatus.APPROVED }),
    );

    const result = await approveListing(44, ADMIN_UID);

    expect(result.moderationStatus).toBe('approved');
    expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('refuses a non-admin caller', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(approveListing(44, 'firebase-mother')).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 403 }),
    );
  });

  it('404s on a listing that does not exist', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(null);

    await expect(approveListing(999, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 404 }),
    );
  });
});

describe('rejectListing', () => {
  it('stores the reason and tells the seller what to fix', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing());
    mockPrisma.communityPost.update.mockResolvedValue(
      makeListing({
        moderationStatus: PostModerationStatus.REJECTED,
        rejectionReason: 'Photos are too blurry',
      }),
    );

    const result = await rejectListing(44, { reason: 'Photos are too blurry' }, ADMIN_UID);

    expect(mockPrisma.communityPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: PostModerationStatus.REJECTED,
          rejectionReason: 'Photos are too blurry',
          reviewedById: ADMIN_ID,
        }),
      }),
    );
    expect(result.rejectionReason).toBe('Photos are too blurry');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MARKETPLACE_LISTING_REJECTED' }),
    );
  });

  it('takes down an already-approved listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(
      makeListing({ moderationStatus: PostModerationStatus.APPROVED }),
    );
    mockPrisma.communityPost.update.mockResolvedValue(
      makeListing({
        moderationStatus: PostModerationStatus.REJECTED,
        rejectionReason: 'Prohibited item',
      }),
    );

    const result = await rejectListing(44, { reason: 'Prohibited item' }, ADMIN_UID);

    expect(result.moderationStatus).toBe('rejected');
  });

  it('refuses to reject an official listing', async () => {
    mockPrisma.communityPost.findFirst.mockResolvedValue(makeListing({ isOfficial: true }));

    await expect(rejectListing(44, { reason: 'nope' }, ADMIN_UID)).rejects.toEqual(
      expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
    );
  });
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
