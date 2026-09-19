/**
 * The only thing that hides a nanny from parents is an admin not having
 * approved her. These pin the `where` clauses of the two places that decide
 * who a parent can see — search and the booking broadcast — so a
 * profile-completeness (or any other) predicate cannot creep back in.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    nannyProfile: { count: jest.fn(), findMany: jest.fn() },
  },
}));

import type { NextFunction, Request, Response } from 'express';

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { requireApprovedNanny } from '@backend/middleware/nanny.middleware';
import { listNannies } from '@backend/services/nanny.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  nannyProfile: { count: jest.Mock; findMany: jest.Mock };
};

describe('listNannies — who a parent can see', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.nannyProfile.count.mockResolvedValue(0);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  });

  it('filters on admin approval and soft-deletes only', async () => {
    await listNannies({ page: 1, limit: 20 });

    expect(mockPrisma.nannyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          user: { deletedAt: null, approvalStatus: 'APPROVED' },
        },
      }),
    );
    const where = mockPrisma.nannyProfile.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('isProfileComplete');
  });
});

describe('requireApprovedNanny — who may use the nanny endpoints', () => {
  const req = { firebaseUser: { uid: 'fb-nanny' } } as unknown as Request;
  const res = {} as Response;

  function nannyRow(approvalStatus: string) {
    return {
      role: 'NANNY',
      deletedAt: null,
      approvalStatus,
      nannyProfile: { deletedAt: null },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets an APPROVED nanny through', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(nannyRow('APPROVED'));
    const next: NextFunction = jest.fn();

    await requireApprovedNanny(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it.each(['PENDING_ID', 'PENDING_REVIEW', 'REJECTED'])(
    'refuses a %s nanny with 403',
    async (status) => {
      mockPrisma.user.findUnique.mockResolvedValue(nannyRow(status));
      const next: NextFunction = jest.fn();

      await requireApprovedNanny(req, res, next);

      const err = (next as jest.Mock).mock.calls[0][0] as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.message).toBe('Your nanny profile has not been approved yet.');
    },
  );
});
