jest.mock('@backend/db/prisma', () => ({
  prisma: {
    package: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    packagePurchase: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createPackagePurchase,
  listActivePackages,
} from '@backend/services/package-purchase.service';

const m = prisma as unknown as {
  package: { findMany: jest.Mock; findFirst: jest.Mock };
  user: { findUnique: jest.Mock };
  packagePurchase: { create: jest.Mock; findFirst: jest.Mock };
};

function catalogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Starter',
    description: null,
    hours: 50,
    price: '2000.00',
    validityDays: 90,
    maxSkills: 2,
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

describe('listActivePackages', () => {
  it('lists only active, offer-not-expired packages as public DTOs', async () => {
    m.package.findMany.mockResolvedValue([catalogRow()]);
    const list = await listActivePackages();
    expect(list[0]).toMatchObject({ id: 1, price: 2000, validityDays: 90, maxSkills: 2 });
    expect(list[0]).not.toHaveProperty('isActive');
    expect(list[0]).not.toHaveProperty('expiresAt');
  });

  it('queries only active, non-deleted packages whose offer is null-or-future, cheapest first', async () => {
    m.package.findMany.mockResolvedValue([]);
    await listActivePackages();
    expect(m.package.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
      orderBy: { price: 'asc' },
    });
  });
});

describe('createPackagePurchase', () => {
  it('snapshots the package into a PENDING_PAYMENT purchase with computed expiry', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findFirst.mockResolvedValue(null); // no active package yet
    m.package.findFirst.mockResolvedValue({
      id: 1,
      name: 'Starter',
      hours: 50,
      price: '2000.00',
      validityDays: 90,
      maxSkills: 2,
      isActive: true,
      expiresAt: null,
      deletedAt: null,
    });
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    const res = await createPackagePurchase('uid', { packageId: 1 });

    expect(res.purchaseId).toBe(55);
    const arg = m.packagePurchase.create.mock.calls[0][0].data;
    expect(arg).toMatchObject({
      userId: 7,
      packageId: 1,
      nameSnapshot: 'Starter',
      hoursPurchased: 50,
      maxSkillsSnapshot: 2,
      status: 'PENDING_PAYMENT',
    });
    expect(arg.expiresAt).toBeInstanceOf(Date);
  });

  it('queries the guard for an ACTIVE, non-deleted bucket with hours remaining and a null-or-future expiresAt', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue({
      id: 1, name: 'Starter', hours: 50, price: '2000.00', validityDays: 90,
      maxSkills: 2, isActive: true, expiresAt: null, deletedAt: null,
    });
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await createPackagePurchase('uid', { packageId: 1 });

    expect(m.packagePurchase.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 7,
        status: 'ACTIVE',
        deletedAt: null,
        hoursRemaining: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
  });

  it('rejects (409) a second purchase while an active package still has hours', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findFirst.mockResolvedValue({ id: 40, status: 'ACTIVE', hoursRemaining: '12.00' });
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('does NOT block when the existing ACTIVE bucket is fully consumed (hoursRemaining = 0)', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    // A real query with `hoursRemaining: { gt: 0 }` would exclude this bucket, so findFirst
    // resolves null even though the user has a fully-drained ACTIVE bucket on file.
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing bucket is EXPIRED', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    // A real query with `status: 'ACTIVE'` would exclude an EXPIRED bucket.
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing bucket sits in PENDING_PAYMENT (abandoned checkout)', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    // A real query with `status: 'ACTIVE'` would exclude a PENDING_PAYMENT bucket.
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing ACTIVE bucket has already passed its expiresAt', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    // A real query with `OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]` would exclude
    // a past-due bucket.
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('throws notFound (404) when there is no user for that firebaseUid', async () => {
    m.user.findUnique.mockResolvedValue(null);
    await expect(createPackagePurchase('missing-uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('throws notFound (404) when the user has been soft-deleted', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: new Date() });
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('throws notFound (404) when the package does not exist, is inactive, or is soft-deleted', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(null);
    await expect(createPackagePurchase('uid', { packageId: 999 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('throws conflict (409) when the package catalog offer has already expired', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findFirst.mockResolvedValue(null);
    m.package.findFirst.mockResolvedValue(
      catalogRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });
});
