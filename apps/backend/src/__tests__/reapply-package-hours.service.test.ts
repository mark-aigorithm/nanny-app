jest.mock('@backend/db/prisma', () => {
  const prisma = {
    packagePurchase: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    packageHoursLedger: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return { prisma };
});

import { prisma } from '@backend/db/prisma';
import { reapplyPackageHoursForBooking } from '@backend/services/package-hours.service';

const m = prisma as unknown as {
  packagePurchase: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  packageHoursLedger: { create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
};

function bucket(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 7,
    hoursRemaining: '10.00',
    maxSkillsSnapshot: 0,
    status: 'ACTIVE',
    expiresAt: new Date('2099-12-01T00:00:00.000Z'),
    deletedAt: null,
    ...over,
  };
}

describe('reapplyPackageHoursForBooking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    m.packagePurchase.updateMany.mockResolvedValue({ count: 1 });
    m.packagePurchase.findFirst.mockResolvedValue({ hoursRemaining: '5.00' });
  });

  it('revives the existing REDEMPTION row instead of inserting a duplicate, and writes no REFUND', async () => {
    // The booking already drew 3h from bucket 1.
    m.packageHoursLedger.findMany.mockResolvedValue([
      { id: 50, purchaseId: 1, hours: -3, deletedAt: null },
    ]);
    // After the restore, bucket 1 shows a spendable balance.
    m.packagePurchase.findMany.mockResolvedValue([bucket({ hoursRemaining: '10.00' })]);

    const result = await reapplyPackageHoursForBooking(prisma as never, {
      bookingId: 99,
      userId: 7,
      baseRate: 100,
      durationMultiplier: 1,
      durationHours: 5,
      totalAmountBeforePackage: 500,
      skillFeesPerHour: [],
      apply: true,
    });

    // Re-drew from the same bucket → UPDATE the existing row, never CREATE a second one.
    expect(m.packageHoursLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50 },
        data: expect.objectContaining({ hours: -5, deletedAt: null }),
      }),
    );
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
    // No REFUND ledger rows are ever written by the reapply path.
    const wroteRefund = m.packageHoursLedger.create.mock.calls.some(
      ([arg]) => (arg as { data?: { type?: string } })?.data?.type === 'REFUND',
    );
    expect(wroteRefund).toBe(false);

    expect(result.hoursApplied).toBe(5);
    expect(result.creditAmount).toBe(500);
  });

  it('releases the reservation (soft-deletes the row) when apply is false', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([
      { id: 50, purchaseId: 1, hours: -3, deletedAt: null },
    ]);
    m.packagePurchase.findMany.mockResolvedValue([bucket()]);

    const result = await reapplyPackageHoursForBooking(prisma as never, {
      bookingId: 99,
      userId: 7,
      baseRate: 100,
      durationMultiplier: 1,
      durationHours: 5,
      totalAmountBeforePackage: 500,
      skillFeesPerHour: [],
      apply: false,
    });

    // The prior row is soft-deleted; nothing new is drawn.
    expect(m.packageHoursLedger.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50 }, data: { deletedAt: expect.any(Date) } }),
    );
    expect(result.hoursApplied).toBe(0);
    expect(result.creditAmount).toBe(0);
  });
});

describe('reapplyPackageHoursForBooking — edge branches', () => {
  const base = {
    bookingId: 99,
    userId: 7,
    baseRate: 100,
    durationMultiplier: 1,
    durationHours: 5,
    totalAmountBeforePackage: 500,
    skillFeesPerHour: [] as number[],
    apply: true,
  };
  const liveBucket = (over: Record<string, unknown> = {}) =>
    bucket({ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), ...over });

  beforeEach(() => {
    jest.clearAllMocks();
    m.packagePurchase.updateMany.mockResolvedValue({ count: 1 });
    m.packagePurchase.findFirst.mockResolvedValue({ hoursRemaining: '5.00' });
  });

  it('restores only the live reservation, not soft-deleted or zero-hour rows', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([
      { id: 50, purchaseId: 1, hours: -3, deletedAt: null },
      { id: 51, purchaseId: 2, hours: -4, deletedAt: new Date() },
      { id: 52, purchaseId: 3, hours: 0, deletedAt: null },
    ]);
    m.packagePurchase.findMany.mockResolvedValue([]);

    await reapplyPackageHoursForBooking(prisma as never, base);

    const restores = m.packagePurchase.updateMany.mock.calls.map(([a]) => a);
    expect(restores).toEqual([
      { where: { id: 1, status: 'ACTIVE', deletedAt: null }, data: { hoursRemaining: { increment: 3 } } },
    ]);
  });

  it('inserts a new REDEMPTION row for a bucket it never drew from before', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    m.packagePurchase.findMany.mockResolvedValue([liveBucket({ id: 2, hoursRemaining: '10.00' })]);

    const r = await reapplyPackageHoursForBooking(prisma as never, base);

    expect(m.packageHoursLedger.create).toHaveBeenCalledWith({
      data: {
        purchaseId: 2,
        userId: 7,
        type: 'REDEMPTION',
        hours: -5,
        balanceAfter: 5,
        bookingId: 99,
        reason: 'Applied 5h to booking #99',
      },
    });
    expect(r).toEqual({ hoursApplied: 5, skillsCovered: 0, creditAmount: 500 });
  });

  it('treats a zero duration multiplier as 1 when pricing the hours', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    m.packagePurchase.findMany.mockResolvedValue([liveBucket({ hoursRemaining: '10.00' })]);

    const r = await reapplyPackageHoursForBooking(prisma as never, { ...base, durationMultiplier: 0 });

    expect(r.creditAmount).toBe(500);
  });

  it('draws nothing when there is nothing left to pay', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    m.packagePurchase.findMany.mockResolvedValue([liveBucket()]);

    const r = await reapplyPackageHoursForBooking(prisma as never, {
      ...base,
      totalAmountBeforePackage: 0,
    });

    expect(r).toEqual({ hoursApplied: 0, skillsCovered: 0, creditAmount: 0 });
    // findMany ran once for the summary; the FIFO draw never started.
    expect(m.packagePurchase.findMany).toHaveBeenCalledTimes(1);
    expect(m.packageHoursLedger.create).not.toHaveBeenCalled();
  });

  it('walks buckets FIFO: stops once covered, skips dust and buckets lost to a race', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    m.packagePurchase.findMany.mockResolvedValue([
      liveBucket({ id: 1, hoursRemaining: '0.004' }),
      liveBucket({ id: 2, hoursRemaining: '2.00' }),
      liveBucket({ id: 3, hoursRemaining: '3.00', maxSkillsSnapshot: 1 }),
      liveBucket({ id: 4, hoursRemaining: '9.00' }),
    ]);
    // Bucket 2 is drained by a concurrent booking between read and write.
    m.packagePurchase.updateMany.mockImplementation(async (args: { where: { id: number } }) => ({
      count: args.where.id === 2 ? 0 : 1,
    }));
    m.packagePurchase.findFirst.mockResolvedValue(null);

    const r = await reapplyPackageHoursForBooking(prisma as never, {
      ...base,
      durationHours: 3,
      totalAmountBeforePackage: 300,
      skillFeesPerHour: [20],
    });

    const draws = m.packageHoursLedger.create.mock.calls.map(([a]) => a.data);
    // With one skill waived an hour is worth 120, so 300 buys 2.5h. Bucket 3
    // alone covers that; bucket 4 is never touched.
    expect(draws).toEqual([
      expect.objectContaining({ purchaseId: 3, hours: -2.5, balanceAfter: 0 }),
    ]);
    expect(m.packagePurchase.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 4 }) }),
    );
    expect(r).toEqual({ hoursApplied: 2.5, skillsCovered: 1, creditAmount: 300 });
  });

  it('reports nothing applied when every bucket was lost to a race', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([]);
    m.packagePurchase.findMany.mockResolvedValue([liveBucket({ hoursRemaining: '10.00' })]);
    m.packagePurchase.updateMany.mockResolvedValue({ count: 0 });

    const r = await reapplyPackageHoursForBooking(prisma as never, base);

    expect(r).toEqual({ hoursApplied: 0, skillsCovered: 0, creditAmount: 0 });
  });

  it('leaves an already soft-deleted row it no longer draws from alone', async () => {
    m.packageHoursLedger.findMany.mockResolvedValue([
      { id: 51, purchaseId: 2, hours: -4, deletedAt: new Date() },
    ]);
    m.packagePurchase.findMany.mockResolvedValue([]);

    await reapplyPackageHoursForBooking(prisma as never, { ...base, apply: false });

    expect(m.packageHoursLedger.update).not.toHaveBeenCalled();
  });
});
