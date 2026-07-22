import {
  CreatePackageSchema,
  PublicPackageSchema,
  PackageHoursBalanceSchema,
  AdminPackagePurchaseSchema,
  AdminPackagePurchaseListQuerySchema,
  AdminPackagePurchaseDetailSchema,
} from '@nanny-app/shared';

describe('package shared schemas', () => {
  it('requires validityDays >= 1 and maxSkills >= 0 on create', () => {
    const ok = CreatePackageSchema.safeParse({
      name: 'Starter', hours: 50, price: 2000, validityDays: 90, maxSkills: 2,
    });
    expect(ok.success).toBe(true);
    expect(CreatePackageSchema.safeParse({
      name: 'X', hours: 1, price: 1, validityDays: 0, maxSkills: 0,
    }).success).toBe(false);
  });

  it('PublicPackageSchema omits internal fields but keeps validity + maxSkills', () => {
    const parsed = PublicPackageSchema.parse({
      id: 1, name: 'Starter', description: null, hours: 50, price: 2000,
      validityDays: 90, maxSkills: 2,
    });
    expect(parsed.maxSkills).toBe(2);
  });

  it('PackageHoursBalanceSchema shape', () => {
    const b = PackageHoursBalanceSchema.parse({ availableHours: 12.5, buckets: [] });
    expect(b.availableHours).toBe(12.5);
  });
});

describe('admin package purchase schemas', () => {
  it('parses a purchase list row with buyer + consumed hours', () => {
    const row = AdminPackagePurchaseSchema.parse({
      id: 1, buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
      hoursPurchased: 50, hoursRemaining: 32.5, hoursConsumed: 17.5,
      pricePaid: 2000, status: 'ACTIVE',
      purchasedAt: '2026-07-01T00:00:00.000Z', expiresAt: '2026-09-29T00:00:00.000Z',
    });
    expect(row.hoursConsumed).toBe(17.5);
  });

  it('list query coerces page/limit and accepts a status filter', () => {
    const q = AdminPackagePurchaseListQuerySchema.parse({ page: '2', limit: '50', status: 'EXPIRED' });
    expect(q).toMatchObject({ page: 2, limit: 50, status: 'EXPIRED' });
  });

  it('detail carries a ledger array with signed hours + balanceAfter', () => {
    const d = AdminPackagePurchaseDetailSchema.parse({
      id: 1, buyerName: 'Sara M', buyerEmail: 's@x.com', packageName: 'Starter',
      hoursPurchased: 50, hoursRemaining: 44, hoursConsumed: 6, pricePaid: 2000,
      status: 'ACTIVE', purchasedAt: '2026-07-01T00:00:00.000Z', expiresAt: null,
      ledger: [
        { id: 9, type: 'REDEMPTION', hours: -6, balanceAfter: 44, reason: 'booking #12',
          bookingId: 12, createdAt: '2026-07-05T00:00:00.000Z' },
      ],
    });
    expect(d.ledger[0].hours).toBe(-6);
  });
});
