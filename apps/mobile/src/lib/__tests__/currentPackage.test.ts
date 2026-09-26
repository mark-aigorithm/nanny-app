import type { PackageHoursBalance, PackagePurchase } from '@nanny-app/shared';

import { currentPackageLabel, usablePackages } from '@mobile/lib/currentPackage';

const NOW = new Date('2026-09-26T12:00:00.000Z');

function bucket(overrides: Partial<PackagePurchase>): PackagePurchase {
  return {
    id: 1,
    packageId: 1,
    packageName: 'Starter',
    hoursPurchased: 10,
    hoursRemaining: 10,
    maxSkills: 1,
    status: 'ACTIVE',
    purchasedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-12-01T00:00:00.000Z',
    ...overrides,
  };
}

function balance(buckets: PackagePurchase[]): PackageHoursBalance {
  return { availableHours: buckets.reduce((s, b) => s + b.hoursRemaining, 0), buckets };
}

describe('currentPackageLabel', () => {
  it('says there is no active package when she holds none', () => {
    expect(currentPackageLabel(balance([]), NOW)).toBe('No active package');
  });

  it('names the package her hours come from', () => {
    expect(currentPackageLabel(balance([bucket({ packageName: 'Family 20' })]), NOW)).toBe(
      'Family 20',
    );
  });

  it('names the first one to be used and counts the rest', () => {
    const buckets = [
      bucket({ id: 1, packageName: 'Starter' }),
      bucket({ id: 2, packageName: 'Family 20' }),
      bucket({ id: 3, packageName: 'Family 40' }),
    ];
    expect(currentPackageLabel(balance(buckets), NOW)).toBe('Starter + 2 more');
  });

  it('ignores packages that are unpaid, used up, refunded or expired', () => {
    const buckets = [
      bucket({ id: 1, packageName: 'Awaiting payment', status: 'PENDING_PAYMENT' }),
      bucket({ id: 2, packageName: 'Used up', hoursRemaining: 0 }),
      bucket({ id: 3, packageName: 'Refunded', status: 'REFUNDED' }),
      bucket({ id: 4, packageName: 'Lapsed', expiresAt: '2026-09-25T00:00:00.000Z' }),
    ];
    expect(currentPackageLabel(balance(buckets), NOW)).toBe('No active package');
    expect(usablePackages(balance(buckets), NOW)).toEqual([]);
  });

  it('treats a package with no expiry as usable', () => {
    expect(currentPackageLabel(balance([bucket({ expiresAt: null })]), NOW)).toBe('Starter');
  });
});
