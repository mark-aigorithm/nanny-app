jest.mock('@backend/db/prisma', () => ({
  prisma: {
    package: {
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
  createPackage,
  deletePackage,
  listPackages,
  updatePackage,
} from '@backend/services/package.service';

const mockPrisma = prisma as unknown as {
  package: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makePackage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Starter Pack',
    description: null,
    hours: 50,
    price: '2000.00',
    isActive: true,
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listPackages', () => {
  it('returns active-and-inactive packages as DTOs, name-ordered, price as number', async () => {
    mockPrisma.package.findMany.mockResolvedValue([
      makePackage({ expiresAt: new Date('2026-12-31T00:00:00.000Z') }),
    ]);
    const rows = await listPackages();
    expect(mockPrisma.package.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    expect(rows).toEqual([
      {
        id: 1,
        name: 'Starter Pack',
        description: null,
        hours: 50,
        price: 2000,
        isActive: true,
        expiresAt: '2026-12-31T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});

describe('createPackage', () => {
  it('creates a new package when the name is free', async () => {
    mockPrisma.package.findUnique.mockResolvedValue(null);
    mockPrisma.package.create.mockResolvedValue(makePackage());
    const created = await createPackage({
      name: 'Starter Pack',
      hours: 50,
      price: 2000,
      isActive: true,
    });
    expect(mockPrisma.package.create).toHaveBeenCalledWith({
      data: {
        name: 'Starter Pack',
        description: null,
        hours: 50,
        price: 2000,
        isActive: true,
        expiresAt: null,
      },
    });
    expect(created.id).toBe(1);
    expect(created.price).toBe(2000);
  });

  it('converts an ISO expiresAt string to a Date', async () => {
    mockPrisma.package.findUnique.mockResolvedValue(null);
    mockPrisma.package.create.mockResolvedValue(makePackage());
    await createPackage({
      name: 'Starter Pack',
      hours: 50,
      price: 2000,
      isActive: true,
      expiresAt: '2026-12-31T00:00:00.000Z',
    });
    expect(mockPrisma.package.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiresAt: new Date('2026-12-31T00:00:00.000Z') }),
    });
  });

  it('throws conflict (409) when a live package with the same name exists', async () => {
    mockPrisma.package.findUnique.mockResolvedValue(makePackage());
    await expect(
      createPackage({ name: 'Starter Pack', hours: 50, price: 2000, isActive: true }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.package.create).not.toHaveBeenCalled();
  });

  it('allows reusing the name of a soft-deleted package', async () => {
    mockPrisma.package.findUnique.mockResolvedValue(makePackage({ deletedAt: new Date() }));
    mockPrisma.package.create.mockResolvedValue(makePackage());
    await expect(
      createPackage({ name: 'Starter Pack', hours: 50, price: 2000, isActive: true }),
    ).resolves.toBeDefined();
  });
});

describe('updatePackage', () => {
  it('throws notFound (404) when the package is missing', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(null);
    await expect(updatePackage(999, { isActive: false })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('updates only provided fields', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(makePackage());
    mockPrisma.package.update.mockResolvedValue(makePackage({ price: '2500.00' }));
    const updated = await updatePackage(1, { price: 2500 });
    expect(mockPrisma.package.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { price: 2500 },
    });
    expect(updated.price).toBe(2500);
  });

  it('clears expiresAt when passed null', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(
      makePackage({ expiresAt: new Date('2026-12-31T00:00:00.000Z') }),
    );
    mockPrisma.package.update.mockResolvedValue(makePackage());
    await updatePackage(1, { expiresAt: null });
    expect(mockPrisma.package.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { expiresAt: null },
    });
  });

  it('throws conflict (409) when renaming onto another live package', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(makePackage({ name: 'Old name' }));
    mockPrisma.package.findUnique.mockResolvedValue(makePackage({ id: 2, name: 'Taken' }));
    await expect(updatePackage(1, { name: 'Taken' })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.package.update).not.toHaveBeenCalled();
  });
});

describe('deletePackage', () => {
  it('throws notFound (404) when the package is missing', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(null);
    await expect(deletePackage(999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('soft-deletes and returns the id', async () => {
    mockPrisma.package.findFirst.mockResolvedValue(makePackage());
    mockPrisma.package.update.mockResolvedValue(makePackage({ deletedAt: new Date() }));
    const result = await deletePackage(1);
    expect(mockPrisma.package.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result).toEqual({ id: 1 });
  });
});
