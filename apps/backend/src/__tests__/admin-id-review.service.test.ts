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
    role: 'MOTHER',
    avatarUrl: null,
    address: 'Cairo',
    idVerificationStatus: 'PENDING_REVIEW',
    idDocumentType: 'PASSPORT',
    idRejectionReason: null,
    idReviewedAt: null,
    idDocumentFrontUrl: 'https://example.com/front.jpg',
    idDocumentBackUrl: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    nannyProfile: null,
    ...overrides,
  };
}

describe('listIdReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pools both roles (nannies must have a live profile), oldest first, with skip/take', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listIdReviews({
      status: 'ALL',
      role: 'ALL',
      sort: 'oldest',
      page: 2,
      limit: 25,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ role: 'MOTHER' }, { role: 'NANNY', nannyProfile: { is: { deletedAt: null } } }],
        },
        orderBy: { createdAt: 'asc' },
        skip: 25,
        take: 25,
      }),
    );
    expect(meta).toEqual({ page: 2, limit: 25, total: 1, totalPages: 1 });
  });

  it('applies the verification-status filter when not ALL', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({
      status: 'PENDING_REVIEW',
      role: 'MOTHER',
      sort: 'oldest',
      page: 1,
      limit: 20,
    });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'MOTHER', idVerificationStatus: 'PENDING_REVIEW' },
      }),
    );
  });

  it('narrows to nannies with a live profile when role is NANNY', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'ALL', role: 'NANNY', sort: 'oldest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, role: 'NANNY', nannyProfile: { is: { deletedAt: null } } },
      }),
    );
  });

  it('flips to newest first when the caller asks for it', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listIdReviews({ status: 'ALL', role: 'ALL', sort: 'newest', page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('maps a mother row: action id is the User id', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ id: 7, role: 'MOTHER', nannyProfile: null })]);

    const { reviews } = await listIdReviews({ status: 'ALL', role: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]).toEqual({
      id: 7,
      userId: 7,
      role: 'MOTHER',
      name: 'Nour Ibrahim',
      avatarUrl: null,
      location: 'Cairo',
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: 'https://example.com/front.jpg',
      idDocumentBackUrl: null,
      idVerificationStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      reviewedAt: null,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('maps a nanny row: action id is the NannyProfile id, not the User id', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([
      makeRow({ id: 7, role: 'NANNY', nannyProfile: { id: 42 } }),
    ]);

    const { reviews } = await listIdReviews({ status: 'ALL', role: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]?.id).toBe(42);
    expect(reviews[0]?.userId).toBe(7);
    expect(reviews[0]?.role).toBe('NANNY');
  });

  it('drops the "-" placeholder last name from the display name', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const { reviews } = await listIdReviews({ status: 'ALL', role: 'ALL', sort: 'oldest', page: 1, limit: 20 });

    expect(reviews[0]?.name).toBe('Mona');
  });
});
