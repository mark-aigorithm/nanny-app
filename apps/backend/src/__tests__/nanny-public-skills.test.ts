/**
 * Deactivating a skill takes it off the market: parents stop seeing it on
 * nanny profiles even though the nannies who hold it keep the link (so
 * reactivating restores them). Deleting it removes it everywhere.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    nannyProfile: { count: jest.fn(), findMany: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import { listNannies } from '@backend/services/nanny.service';

const mockPrisma = prisma as unknown as {
  nannyProfile: { count: jest.Mock; findMany: jest.Mock };
};

describe('nanny skills a parent can see', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.nannyProfile.count.mockResolvedValue(0);
    mockPrisma.nannyProfile.findMany.mockResolvedValue([]);
  });

  it('includes only active, non-deleted catalog skills', async () => {
    await listNannies({ page: 1, limit: 20 });

    expect(mockPrisma.nannyProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          nannySkills: {
            where: { deletedAt: null, skill: { deletedAt: null, isActive: true } },
            include: { skill: true },
          },
        }),
      }),
    );
  });
});
