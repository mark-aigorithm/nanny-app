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
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
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
