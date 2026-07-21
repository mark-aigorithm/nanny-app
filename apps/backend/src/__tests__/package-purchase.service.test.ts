jest.mock('@backend/db/prisma', () => ({
  prisma: {
    package: { findMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    packagePurchase: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import { PAYMOB_INTENTION_TTL_MS } from '@backend/lib/paymob/constants';
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

/**
 * The service now issues TWO distinct `packagePurchase.findFirst` guard queries
 * (ACTIVE-bucket guard, then PENDING_PAYMENT-TTL guard). This stub routes each
 * call to its own canned result based on the `status` the service queried for,
 * so tests can control each guard independently instead of one shared mock
 * value silently applying to both queries.
 */
function mockPurchaseGuards(opts: { active?: unknown; pending?: unknown } = {}) {
  m.packagePurchase.findFirst.mockImplementation(
    async ({ where }: { where: { status: string } }) => {
      if (where.status === 'ACTIVE') return opts.active ?? null;
      if (where.status === 'PENDING_PAYMENT') return opts.pending ?? null;
      return null;
    },
  );
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
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards(); // no active package, no recent pending checkout
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
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards();
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

  it('queries the guard for a PENDING_PAYMENT purchase created within the Paymob intention TTL', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    const before = Date.now();
    await createPackagePurchase('uid', { packageId: 1 });
    const after = Date.now();

    const pendingCall = m.packagePurchase.findFirst.mock.calls.find(
      ([args]: [{ where: { status: string } }]) => args.where.status === 'PENDING_PAYMENT',
    ) as
      | [
          {
            where: {
              userId: number;
              status: string;
              deletedAt: null;
              createdAt: { gt: Date };
              payments: { some: { status: string; deletedAt: null } };
            };
          },
        ]
      | undefined;
    expect(pendingCall).toBeDefined();

    const where = pendingCall![0].where;
    expect(where).toMatchObject({
      userId: 7,
      status: 'PENDING_PAYMENT',
      deletedAt: null,
      // Only a purchase whose latest payment attempt is still PENDING blocks a
      // retry — one whose payment never started (e.g. missing phone) must not.
      payments: { some: { status: 'PENDING', deletedAt: null } },
    });

    // The cutoff must be computed as "now - PAYMOB_INTENTION_TTL_MS" at call time —
    // a pending checkout should block for exactly as long as its Paymob intention
    // is still usable, so the two windows stay consistent by construction.
    const cutoffMs = where.createdAt.gt.getTime();
    expect(cutoffMs).toBeGreaterThanOrEqual(before - PAYMOB_INTENTION_TTL_MS);
    expect(cutoffMs).toBeLessThanOrEqual(after - PAYMOB_INTENTION_TTL_MS);
  });

  it('rejects (409) a second purchase while an active package still has hours', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards({ active: { id: 40, status: 'ACTIVE', hoursRemaining: '12.00' } });
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('rejects (409) with a distinct message when a PENDING_PAYMENT checkout exists within the intention TTL', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    // No active bucket, but a checkout was started moments ago and hasn't been paid yet.
    mockPurchaseGuards({
      pending: { id: 41, status: 'PENDING_PAYMENT', createdAt: new Date() },
    });

    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 409,
      message: 'You already have a checkout in progress. Complete it or try again shortly.',
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();

    // The two conflicts are different situations and must read differently.
    mockPurchaseGuards({ active: { id: 40, status: 'ACTIVE', hoursRemaining: '12.00' } });
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 409,
      message: 'You already have an active package. Use it up or wait for it to expire before buying another.',
    });
  });

  it('does NOT block when the existing ACTIVE bucket is fully consumed (hoursRemaining = 0)', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    // A real query with `hoursRemaining: { gt: 0 }` would exclude this bucket, so findFirst
    // resolves null even though the user has a fully-drained ACTIVE bucket on file.
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing bucket is EXPIRED', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    // A real query with `status: 'ACTIVE'` would exclude an EXPIRED bucket.
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing PENDING_PAYMENT purchase is older than the intention TTL (abandoned checkout)', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    // A real query with `createdAt: { gt: now - PAYMOB_INTENTION_TTL_MS }` would exclude a
    // PENDING_PAYMENT row older than the TTL — it's an abandoned checkout, not a live one,
    // so it must not permanently lock the parent out of buying again.
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(catalogRow());
    m.packagePurchase.create.mockResolvedValue({ id: 55 });

    await expect(createPackagePurchase('uid', { packageId: 1 })).resolves.toEqual({ purchaseId: 55 });
    expect(m.packagePurchase.create).toHaveBeenCalled();
  });

  it('does NOT block when the existing ACTIVE bucket has already passed its expiresAt', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    // A real query with `OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]` would exclude
    // a past-due bucket.
    mockPurchaseGuards();
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
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(null);
    await expect(createPackagePurchase('uid', { packageId: 999 })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });

  it('throws conflict (409) when the package catalog offer has already expired', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null, phone: '+201000000000' });
    mockPurchaseGuards();
    m.package.findFirst.mockResolvedValue(
      catalogRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    );
    await expect(createPackagePurchase('uid', { packageId: 1 })).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(m.packagePurchase.create).not.toHaveBeenCalled();
  });
});
