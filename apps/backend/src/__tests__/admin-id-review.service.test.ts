jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

import { prisma } from '@backend/db/prisma';
import { listIdReviews } from '@backend/services/admin-id-review.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock; count: jest.Mock };
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firstName: 'Nour',
    lastName: 'Ibrahim',
    avatarUrl: null,
    address: 'Cairo',
    approvalStatus: 'PENDING_REVIEW',
    idDocumentType: 'PASSPORT',
    rejectionReason: null,
    reviewedAt: null,
    idDocumentFrontUrl: 'https://example.com/front.jpg',
    idDocumentBackUrl: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('listIdReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists parents only — a nanny is reviewed on her detail page, never here', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 2, limit: 25 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'MOTHER' },
        orderBy: { createdAt: 'asc' },
        skip: 25,
        take: 25,
      }),
    );
    expect(meta).toEqual({ page: 2, limit: 25, total: 1, totalPages: 1 });
  });

  it('applies the approval-status filter when not ALL', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'PENDING_REVIEW', sort: 'oldest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'MOTHER', approvalStatus: 'PENDING_REVIEW' },
      }),
    );
  });

  it('flips to newest first when the caller asks for it', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'ALL', sort: 'newest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('maps a row: id is the User id the mother endpoints are keyed by', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { reviews } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]).toEqual({
      id: 7,
      name: 'Nour Ibrahim',
      avatarUrl: null,
      location: 'Cairo',
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: 'https://example.com/front.jpg',
      idDocumentBackUrl: null,
      approvalStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      reviewedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('drops the "-" placeholder last name from the display name', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const { reviews } = await listIdReviews({ status: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]?.name).toBe('Mona');
  });
});
