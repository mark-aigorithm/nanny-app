jest.mock('@backend/db/prisma', () => ({
  prisma: {
    certification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createCertification,
  deleteCertification,
  listActiveCertifications,
  listCertifications,
  reconcileNannyCertifications,
  updateCertification,
} from '@backend/services/certification.service';

const mockPrisma = prisma as unknown as {
  certification: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeCertification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cert-1',
    name: 'CPR',
    description: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listCertifications', () => {
  it('returns active-and-inactive certifications as DTOs, name-ordered', async () => {
    mockPrisma.certification.findMany.mockResolvedValue([makeCertification()]);
    const rows = await listCertifications();
    expect(mockPrisma.certification.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    expect(rows).toEqual([
      {
        id: 'cert-1',
        name: 'CPR',
        description: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('listActiveCertifications', () => {
  it('queries only active, non-deleted certifications and returns the public shape', async () => {
    mockPrisma.certification.findMany.mockResolvedValue([{ id: 'cert-1', name: 'CPR' }]);
    const rows = await listActiveCertifications();
    expect(mockPrisma.certification.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    expect(rows).toEqual([{ id: 'cert-1', name: 'CPR' }]);
  });
});

describe('createCertification', () => {
  it('creates a new certification when the name is free', async () => {
    mockPrisma.certification.findUnique.mockResolvedValue(null);
    mockPrisma.certification.create.mockResolvedValue(makeCertification());
    const created = await createCertification({ name: 'CPR', isActive: true });
    expect(mockPrisma.certification.create).toHaveBeenCalledWith({
      data: { name: 'CPR', description: null, isActive: true },
    });
    expect(created.id).toBe('cert-1');
  });

  it('throws conflict (409) when a live certification with the same name exists', async () => {
    mockPrisma.certification.findUnique.mockResolvedValue(makeCertification());
    await expect(createCertification({ name: 'CPR', isActive: true })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.certification.create).not.toHaveBeenCalled();
  });

  it('allows reusing the name of a soft-deleted certification', async () => {
    mockPrisma.certification.findUnique.mockResolvedValue(
      makeCertification({ deletedAt: new Date() }),
    );
    mockPrisma.certification.create.mockResolvedValue(makeCertification());
    await expect(createCertification({ name: 'CPR', isActive: true })).resolves.toBeDefined();
  });
});

describe('updateCertification', () => {
  it('throws notFound (404) when the certification is missing', async () => {
    mockPrisma.certification.findFirst.mockResolvedValue(null);
    await expect(updateCertification('nope', { isActive: false })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('updates only provided fields', async () => {
    mockPrisma.certification.findFirst.mockResolvedValue(makeCertification());
    mockPrisma.certification.update.mockResolvedValue(makeCertification({ isActive: false }));
    const updated = await updateCertification('cert-1', { isActive: false });
    expect(mockPrisma.certification.update).toHaveBeenCalledWith({
      where: { id: 'cert-1' },
      data: { isActive: false },
    });
    expect(updated.isActive).toBe(false);
  });

  it('throws conflict (409) when renaming onto another live certification', async () => {
    mockPrisma.certification.findFirst.mockResolvedValue(makeCertification({ name: 'Old name' }));
    mockPrisma.certification.findUnique.mockResolvedValue(
      makeCertification({ id: 'cert-2', name: 'Taken' }),
    );
    await expect(updateCertification('cert-1', { name: 'Taken' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.certification.update).not.toHaveBeenCalled();
  });
});

describe('deleteCertification', () => {
  it('throws notFound (404) when the certification is missing', async () => {
    mockPrisma.certification.findFirst.mockResolvedValue(null);
    await expect(deleteCertification('nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('soft-deletes and returns the id', async () => {
    mockPrisma.certification.findFirst.mockResolvedValue(makeCertification());
    mockPrisma.certification.update.mockResolvedValue(makeCertification({ deletedAt: new Date() }));
    const result = await deleteCertification('cert-1');
    expect(mockPrisma.certification.update).toHaveBeenCalledWith({
      where: { id: 'cert-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result).toEqual({ id: 'cert-1' });
  });
});

describe('reconcileNannyCertifications', () => {
  function makeTx() {
    return {
      certification: { findMany: jest.fn() },
      nannyCertification: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
  }

  it('creates newly-added active certifications and validates them', async () => {
    const tx = makeTx();
    tx.nannyCertification.findMany.mockResolvedValue([]);
    tx.certification.findMany.mockResolvedValue([{ id: 'cert-1' }]);

    await reconcileNannyCertifications(tx as never, 'nanny-1', ['cert-1']);

    expect(tx.certification.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['cert-1'] }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    expect(tx.nannyCertification.create).toHaveBeenCalledWith({
      data: { nannyProfileId: 'nanny-1', certificationId: 'cert-1' },
    });
  });

  it('soft-deletes certifications no longer wanted', async () => {
    const tx = makeTx();
    tx.nannyCertification.findMany.mockResolvedValue([
      { id: 'link-1', certificationId: 'cert-1', deletedAt: null },
    ]);
    tx.certification.findMany.mockResolvedValue([]);

    await reconcileNannyCertifications(tx as never, 'nanny-1', []);

    expect(tx.nannyCertification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['link-1'] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.nannyCertification.create).not.toHaveBeenCalled();
  });

  it('reactivates a previously soft-deleted certification', async () => {
    const tx = makeTx();
    tx.nannyCertification.findMany.mockResolvedValue([
      { id: 'link-1', certificationId: 'cert-1', deletedAt: new Date() },
    ]);
    tx.certification.findMany.mockResolvedValue([{ id: 'cert-1' }]);

    await reconcileNannyCertifications(tx as never, 'nanny-1', ['cert-1']);

    expect(tx.nannyCertification.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { deletedAt: null },
    });
  });

  it('keeps an already-held certification even when it is now inactive (no re-validation)', async () => {
    const tx = makeTx();
    tx.nannyCertification.findMany.mockResolvedValue([
      { id: 'link-1', certificationId: 'cert-1', deletedAt: null },
    ]);

    await reconcileNannyCertifications(tx as never, 'nanny-1', ['cert-1']);

    // Already actively linked → not sent for validation, so no error.
    expect(tx.certification.findMany).not.toHaveBeenCalled();
    expect(tx.nannyCertification.updateMany).not.toHaveBeenCalled();
    expect(tx.nannyCertification.create).not.toHaveBeenCalled();
  });

  it('throws badRequest (400) when a newly-added id is invalid or inactive', async () => {
    const tx = makeTx();
    tx.nannyCertification.findMany.mockResolvedValue([]);
    tx.certification.findMany.mockResolvedValue([]); // none valid

    await expect(
      reconcileNannyCertifications(tx as never, 'nanny-1', ['bad-id']),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.nannyCertification.create).not.toHaveBeenCalled();
  });
});
