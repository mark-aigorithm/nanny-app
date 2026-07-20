jest.mock('@backend/db/prisma', () => ({
  prisma: {
    packagePurchase: { findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    packageHoursLedger: { create: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  creditPurchaseHours,
  expirePackagesForUser,
  getAvailableHours,
  getMyPackageHours,
  redeemPackageHours,
  refundPackageHours,
} from '@backend/services/package-hours.service';

const m = prisma as unknown as {
  packagePurchase: { findMany: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
  packageHoursLedger: { create: jest.Mock; findMany: jest.Mock };
  user: { findUnique: jest.Mock };
};

function bucket(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 7,
    hoursPurchased: 10,
    hoursRemaining: '10.00',
    maxSkillsSnapshot: 2,
    status: 'ACTIVE',
    purchasedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    packageId: 3,
    nameSnapshot: 'Starter',
    deletedAt: null,
    ...over,
  };
}

/**
 * `packageHoursLedger.findMany` is called twice inside `refundPackageHours` — once for the
 * REDEMPTION debits, once for the idempotency guard's existing REFUND rows — so a single
 * blanket `mockResolvedValue` would (wrongly) answer both calls with the same array. This
 * routes each call to the right fixture based on the query's `type` filter.
 */
function mockLedgerFindMany(debits: unknown[], existingRefunds: unknown[] = []) {
  m.packageHoursLedger.findMany.mockImplementation(async ({ where }: { where: { type: string } }) =>
    where.type === 'REDEMPTION' ? debits : existingRefunds,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAvailableHours', () => {
  it('sums hoursRemaining across active non-expired buckets', async () => {
    m.packagePurchase.findMany.mockResolvedValue([
      bucket(),
      bucket({ id: 2, hoursRemaining: '5.50' }),
    ]);
    expect(await getAvailableHours(7)).toBe(15.5);
  });

  it('queries only ACTIVE, non-deleted buckets with hours left, soonest-expiry first', async () => {
    m.packagePurchase.findMany.mockResolvedValue([]);
    await getAvailableHours(7);
    expect(m.packagePurchase.findMany).toHaveBeenCalledWith({
      where: { userId: 7, status: 'ACTIVE', deletedAt: null, hoursRemaining: { gt: 0 } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('excludes a bucket whose expiresAt has already passed', async () => {
    m.packagePurchase.findMany.mockResolvedValue([
      bucket({ id: 1, hoursRemaining: '10.00' }),
      bucket({ id: 2, hoursRemaining: '5.00', expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);
    expect(await getAvailableHours(7)).toBe(10);
  });

  it('treats a null expiresAt as never-expiring', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ expiresAt: null, hoursRemaining: '3.00' })]);
    expect(await getAvailableHours(7)).toBe(3);
  });

  it('returns 0 when there are no active buckets', async () => {
    m.packagePurchase.findMany.mockResolvedValue([]);
    expect(await getAvailableHours(7)).toBe(0);
  });
});

describe('creditPurchaseHours', () => {
  it('promotes PENDING_PAYMENT to ACTIVE, sets hoursRemaining and purchasedAt, keeps the stored expiresAt as-is, and writes a PURCHASE ledger row', async () => {
    const pending = bucket({
      id: 5,
      userId: 7,
      status: 'PENDING_PAYMENT',
      hoursPurchased: 20,
      hoursRemaining: '0.00',
      purchasedAt: null,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      nameSnapshot: 'Starter Pack',
    });
    m.packagePurchase.findFirst.mockResolvedValue(pending);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    await creditPurchaseHours(prisma as never, 5);

    expect(m.packagePurchase.findFirst).toHaveBeenCalledWith({ where: { id: 5, deletedAt: null } });
    expect(m.packagePurchase.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        status: 'ACTIVE',
        hoursRemaining: 20,
        purchasedAt: expect.any(Date),
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    expect(m.packageHoursLedger.create).toHaveBeenCalledWith({
      data: {
        purchaseId: 5,
        userId: 7,
        type: 'PURCHASE',
        hours: 20,
        balanceAfter: 20,
        reason: 'Purchased Starter Pack',
      },
    });
  });

  it('is idempotent — calling it again on an already-ACTIVE purchase does not double-credit', async () => {
    m.packagePurchase.findFirst.mockResolvedValue(bucket({ id: 5, status: 'ACTIVE' }));

    await creditPurchaseHours(prisma as never, 5);

    expect(m.packagePurchase.update).not.toHaveBeenCalled();
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });

  it('throws notFound (404) when the purchase does not exist', async () => {
    m.packagePurchase.findFirst.mockResolvedValue(null);
    await expect(creditPurchaseHours(prisma as never, 999)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('redeemPackageHours (FIFO)', () => {
  it('drains soonest-expiring bucket first and writes REDEMPTION rows', async () => {
    m.packagePurchase.findMany.mockResolvedValue([
      bucket({ id: 1, hoursRemaining: '4.00', expiresAt: new Date('2026-08-01'), maxSkillsSnapshot: 1 }),
      bucket({ id: 2, hoursRemaining: '10.00', expiresAt: new Date('2026-10-01'), maxSkillsSnapshot: 3 }),
    ]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});
    const res = await redeemPackageHours(prisma as never, { userId: 7, bookingId: 99, hoursNeeded: 6 });
    expect(res.hoursApplied).toBe(6);
    expect(res.maxSkillsAllowed).toBe(3); // max across consumed buckets
    expect(res.purchaseIds).toEqual([1, 2]);
    expect(m.packageHoursLedger.create).toHaveBeenCalledTimes(2);
  });

  it('applies only what is available when short', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ hoursRemaining: '2.00' })]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});
    const res = await redeemPackageHours(prisma as never, { userId: 7, bookingId: 99, hoursNeeded: 6 });
    expect(res.hoursApplied).toBe(2);
  });

  it('writes a negative-hours REDEMPTION row referencing the bookingId, with the correct balanceAfter', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ id: 1, hoursRemaining: '4.00' })]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    await redeemPackageHours(prisma as never, { userId: 7, bookingId: 42, hoursNeeded: 3 });

    expect(m.packagePurchase.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { hoursRemaining: 1 },
    });
    expect(m.packageHoursLedger.create).toHaveBeenCalledWith({
      data: {
        purchaseId: 1,
        userId: 7,
        type: 'REDEMPTION',
        hours: -3,
        balanceAfter: 1,
        bookingId: 42,
        reason: expect.stringContaining('42'),
      },
    });
  });

  it('returns zero applied hours and no purchaseIds when there is nothing to redeem from', async () => {
    m.packagePurchase.findMany.mockResolvedValue([]);
    const res = await redeemPackageHours(prisma as never, { userId: 7, bookingId: 99, hoursNeeded: 6 });
    expect(res).toEqual({ hoursApplied: 0, maxSkillsAllowed: 0, purchaseIds: [] });
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });
});

describe('refundPackageHours', () => {
  it('restores hours to the originating bucket and writes a REFUND row', async () => {
    mockLedgerFindMany([{ id: 10, purchaseId: 1, userId: 7, hours: '-3.00' }]);
    m.packagePurchase.findFirst.mockResolvedValue(bucket({ id: 1, hoursRemaining: '1.00' }));
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    const refunded = await refundPackageHours(prisma as never, 42);

    expect(m.packageHoursLedger.findMany).toHaveBeenCalledWith({
      where: { bookingId: 42, type: 'REDEMPTION', deletedAt: null },
    });
    expect(m.packagePurchase.findFirst).toHaveBeenCalledWith({ where: { id: 1, deletedAt: null } });
    expect(refunded).toBe(3);
    expect(m.packagePurchase.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { hoursRemaining: 4 },
    });
    expect(m.packageHoursLedger.create).toHaveBeenCalledWith({
      data: {
        purchaseId: 1,
        userId: 7,
        type: 'REFUND',
        hours: 3,
        balanceAfter: 4,
        bookingId: 42,
        reason: expect.stringContaining('42'),
      },
    });
  });

  it('sums refunds across multiple buckets that were drawn for the same booking', async () => {
    mockLedgerFindMany([
      { id: 10, purchaseId: 1, userId: 7, hours: '-4.00' },
      { id: 11, purchaseId: 2, userId: 7, hours: '-2.00' },
    ]);
    m.packagePurchase.findFirst
      .mockResolvedValueOnce(bucket({ id: 1, hoursRemaining: '0.00' }))
      .mockResolvedValueOnce(bucket({ id: 2, hoursRemaining: '8.00' }));
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    const refunded = await refundPackageHours(prisma as never, 42);
    expect(refunded).toBe(6);
    expect(m.packagePurchase.update).toHaveBeenCalledTimes(2);
    expect(m.packageHoursLedger.create).toHaveBeenCalledTimes(2);
  });

  it('skips a bucket that has since expired', async () => {
    mockLedgerFindMany([{ id: 10, purchaseId: 1, userId: 7, hours: '-3.00' }]);
    m.packagePurchase.findFirst.mockResolvedValue(
      bucket({ id: 1, status: 'EXPIRED', hoursRemaining: '0.00' }),
    );

    const refunded = await refundPackageHours(prisma as never, 42);
    expect(refunded).toBe(0);
    expect(m.packagePurchase.update).not.toHaveBeenCalled();
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });

  it('returns 0 when there is nothing to refund for that booking', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    expect(await refundPackageHours(prisma as never, 42)).toBe(0);
  });

  it('is idempotent — a second call for the same bookingId is a no-op', async () => {
    mockLedgerFindMany(
      [{ id: 10, purchaseId: 1, userId: 7, hours: '-3.00' }],
      [{ id: 99, purchaseId: 1, userId: 7, hours: '3.00' }],
    );
    m.packagePurchase.findFirst.mockResolvedValue(bucket({ id: 1, hoursRemaining: '1.00' }));
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    const refunded = await refundPackageHours(prisma as never, 42);

    expect(refunded).toBe(0);
    expect(m.packagePurchase.update).not.toHaveBeenCalled();
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });
});

describe('expirePackagesForUser', () => {
  it('flips a past-due ACTIVE bucket to EXPIRED, zeroes hoursRemaining, and writes an EXPIRY ledger row', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ id: 1, hoursRemaining: '4.00' })]);
    m.packagePurchase.update.mockResolvedValue({});
    m.packageHoursLedger.create.mockResolvedValue({});

    await expirePackagesForUser(7);

    expect(m.packagePurchase.findMany).toHaveBeenCalledWith({
      where: { userId: 7, status: 'ACTIVE', deletedAt: null, expiresAt: { lt: expect.any(Date) } },
    });
    expect(m.packagePurchase.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'EXPIRED', hoursRemaining: 0 },
    });
    expect(m.packageHoursLedger.create).toHaveBeenCalledWith({
      data: {
        purchaseId: 1,
        userId: 7,
        type: 'EXPIRY',
        hours: -4,
        balanceAfter: 0,
        reason: expect.stringContaining('4'),
      },
    });
  });

  it('does not write a ledger row when there are no hours left to forfeit', async () => {
    m.packagePurchase.findMany.mockResolvedValue([bucket({ id: 1, hoursRemaining: '0.00' })]);
    m.packagePurchase.update.mockResolvedValue({});

    await expirePackagesForUser(7);

    expect(m.packagePurchase.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'EXPIRED', hoursRemaining: 0 },
    });
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });

  it('is a no-op when there are no stale buckets', async () => {
    m.packagePurchase.findMany.mockResolvedValue([]);
    await expirePackagesForUser(7);
    expect(m.packagePurchase.update).not.toHaveBeenCalled();
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });
});

describe('getMyPackageHours', () => {
  it('resolves the user, lazily expires stale buckets, and returns the balance DTO', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: null });
    m.packagePurchase.findMany
      .mockResolvedValueOnce([]) // expirePackagesForUser's stale lookup
      .mockResolvedValueOnce([
        bucket({
          id: 1,
          hoursRemaining: '6.00',
          hoursPurchased: 10,
          maxSkillsSnapshot: 2,
          status: 'ACTIVE',
          nameSnapshot: 'Starter Pack',
          purchasedAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        }),
      ]);

    const result = await getMyPackageHours('uid-7');

    expect(m.user.findUnique).toHaveBeenCalledWith({ where: { firebaseUid: 'uid-7' } });
    expect(result).toEqual({
      availableHours: 6,
      buckets: [
        {
          id: 1,
          packageName: 'Starter Pack',
          hoursPurchased: 10,
          hoursRemaining: 6,
          maxSkills: 2,
          status: 'ACTIVE',
          purchasedAt: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-12-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('throws notFound (404) when there is no user for that firebaseUid', async () => {
    m.user.findUnique.mockResolvedValue(null);
    await expect(getMyPackageHours('missing-uid')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws notFound (404) when the user has been soft-deleted', async () => {
    m.user.findUnique.mockResolvedValue({ id: 7, deletedAt: new Date() });
    await expect(getMyPackageHours('uid-7')).rejects.toMatchObject({ statusCode: 404 });
  });
});
