import {
  CreatePackageSchema,
  PublicPackageSchema,
  PackageHoursBalanceSchema,
} from '../package';

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
