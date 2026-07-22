jest.mock('@backend/db/prisma', () => ({
  prisma: {
    packagePurchase: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    packageHoursLedger: { findMany: jest.fn() },
  },
}));
import { prisma } from '@backend/db/prisma';
import {
  listPackagePurchases, getPackagePurchaseDetail,
} from '@backend/services/admin-package-purchase.service';
const m = prisma as unknown as {
  packagePurchase: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
  packageHoursLedger: { findMany: jest.Mock };
};
beforeEach(() => jest.clearAllMocks());

function row(over = {}) {
  return {
    id: 1, hoursPurchased: 50, hoursRemaining: '32.50', pricePaid: '2000.00',
    status: 'ACTIVE', purchasedAt: new Date('2026-07-01'), expiresAt: new Date('2026-09-29'),
    nameSnapshot: 'Starter', user: { firstName: 'Sara', lastName: 'M', email: 's@x.com' }, ...over,
  };
}

it('paginates and maps buyer + hoursConsumed', async () => {
  m.packagePurchase.count.mockResolvedValue(1);
  m.packagePurchase.findMany.mockResolvedValue([row()]);
  const res = await listPackagePurchases({ page: 1, limit: 20 });
  expect(res.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  expect(res.purchases[0]).toMatchObject({
    buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
    hoursRemaining: 32.5, hoursConsumed: 17.5, pricePaid: 2000,
  });
});

it('detail includes the ledger, newest first', async () => {
  m.packagePurchase.findFirst.mockResolvedValue(row());
  m.packageHoursLedger.findMany.mockResolvedValue([
    { id: 9, type: 'REDEMPTION', hours: '-6.00', balanceAfter: '44.00',
      reason: 'booking #12', bookingId: 12, createdAt: new Date('2026-07-05') },
  ]);
  const d = await getPackagePurchaseDetail(1);
  expect(d.ledger[0]).toMatchObject({ type: 'REDEMPTION', hours: -6, balanceAfter: 44, bookingId: 12 });
});

it('throws 404 when the purchase is missing', async () => {
  m.packagePurchase.findFirst.mockResolvedValue(null);
  await expect(getPackagePurchaseDetail(999)).rejects.toMatchObject({ statusCode: 404 });
});
