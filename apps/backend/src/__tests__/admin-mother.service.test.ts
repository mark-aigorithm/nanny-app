jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

// admin-user.service imports firebaseAuth (→ config env validation) at module load;
// mock it so the mother-directory tests stay hermetic and don't need real env vars.
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { createUser: jest.fn() },
}));

// The ID reject flow deletes Storage objects and notifies — mock both so the
// unit tests stay hermetic (no GCS, no push).
jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue(undefined),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { AppError } from '@backend/lib/errors';
import { prisma } from '@backend/db/prisma';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import {
  approveMother,
  getAdminMother,
  listAdminMothers,
  rejectMother,
} from '@backend/services/admin-user.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; update: jest.Mock };
};
const mockDeleteStorage = deleteStorageObjectByUrl as jest.Mock;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    firstName: 'Nour',
    lastName: 'Ibrahim',
    email: 'nour@example.com',
    phone: '+201000000000',
    avatarUrl: null,
    address: 'Cairo',
    isEmailVerified: true,
    isPhoneVerified: false,
    isActive: true,
    idVerificationStatus: 'PENDING_ID',
    idDocumentType: null,
    idRejectionReason: null,
    idReviewedAt: null,
    idDocumentFrontUrl: null,
    idDocumentBackUrl: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    _count: { bookingsAsMother: 3 },
    ...overrides,
  };
}

describe('listAdminMothers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries only mother accounts, newest first, applying skip/take', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listAdminMothers('ALL', { page: 2, limit: 25 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'MOTHER', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 25,
        take: 25,
      }),
    );
    expect(meta).toEqual({ page: 2, limit: 25, total: 1, totalPages: 1 });
  });

  it('filters by verification status when not ALL', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);

    await listAdminMothers('PENDING_REVIEW', { page: 1, limit: 20 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'MOTHER', deletedAt: null, idVerificationStatus: 'PENDING_REVIEW' },
      }),
    );
  });

  it('maps rows to the AdminMother DTO', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([
      makeRow({
        idVerificationStatus: 'PENDING_REVIEW',
        idDocumentType: 'PASSPORT',
        idDocumentFrontUrl: 'https://example.com/front.jpg',
      }),
    ]);

    const { mothers } = await listAdminMothers('ALL', { page: 1, limit: 20 });

    expect(mothers[0]).toEqual({
      id: 'user-1',
      name: 'Nour Ibrahim',
      email: 'nour@example.com',
      phone: '+201000000000',
      avatarUrl: null,
      location: 'Cairo',
      isEmailVerified: true,
      isPhoneVerified: false,
      isActive: true,
      idVerificationStatus: 'PENDING_REVIEW',
      idDocumentType: 'PASSPORT',
      rejectionReason: null,
      reviewedAt: null,
      idDocumentFrontUrl: 'https://example.com/front.jpg',
      idDocumentBackUrl: null,
      bookingCount: 3,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('drops the "-" placeholder last name from the display name', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const { mothers } = await listAdminMothers('ALL', { page: 1, limit: 20 });

    expect(mothers[0]?.name).toBe('Mona');
  });
});

describe('getAdminMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the mother DTO for an existing account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());

    const mother = await getAdminMother('user-1');

    expect(mother.id).toBe('user-1');
    expect(mother.name).toBe('Nour Ibrahim');
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', role: 'MOTHER', deletedAt: null },
      }),
    );
  });

  it('throws when the mother does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(getAdminMother('missing')).rejects.toThrow(AppError);
  });
});

describe('approveMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks the ID APPROVED and clears any rejection reason', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(makeRow({ idVerificationStatus: 'PENDING_REVIEW' }))
      .mockResolvedValueOnce(makeRow({ idVerificationStatus: 'APPROVED' }));
    mockPrisma.user.update.mockResolvedValue(makeRow({ idVerificationStatus: 'APPROVED' }));

    const mother = await approveMother('user-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          idVerificationStatus: 'APPROVED',
          idRejectionReason: null,
        }),
      }),
    );
    expect(mother.idVerificationStatus).toBe('APPROVED');
  });

  it('rejects re-approving an already approved mother', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow({ idVerificationStatus: 'APPROVED' }));
    await expect(approveMother('user-1')).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('rejectMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('nulls the ID URLs, deletes the Storage files, and stores the reason', async () => {
    const front = 'https://example.com/o/nanny-ids%2Fuser-1%2Ffront.jpg?alt=media';
    const back = 'https://example.com/o/nanny-ids%2Fuser-1%2Fback.jpg?alt=media';
    mockPrisma.user.findFirst
      .mockResolvedValueOnce(
        makeRow({
          idVerificationStatus: 'PENDING_REVIEW',
          idDocumentFrontUrl: front,
          idDocumentBackUrl: back,
        }),
      )
      .mockResolvedValueOnce(makeRow({ idVerificationStatus: 'REJECTED' }));
    mockPrisma.user.update.mockResolvedValue(makeRow({ idVerificationStatus: 'REJECTED' }));

    await rejectMother('user-1', { reason: 'Blurry photo' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          idVerificationStatus: 'REJECTED',
          idRejectionReason: 'Blurry photo',
          idDocumentFrontUrl: null,
          idDocumentBackUrl: null,
        }),
      }),
    );
    expect(mockDeleteStorage).toHaveBeenCalledWith(front);
    expect(mockDeleteStorage).toHaveBeenCalledWith(back);
  });

  it('rejects re-rejecting an already rejected mother', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow({ idVerificationStatus: 'REJECTED' }));
    await expect(rejectMother('user-1', {})).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
