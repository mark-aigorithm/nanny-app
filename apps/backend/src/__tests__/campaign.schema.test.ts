import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
} from '@nanny-app/shared';

describe('CreateCampaignSchema — exactly-one-target', () => {
  const base = {
    title: 'Summer offer',
    imageUrl: 'https://cdn.example.com/a.jpg',
  };

  it('accepts a PACKAGE campaign with only packageId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a PROMO_CODE campaign with only promoCodeId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PROMO_CODE',
      promoCodeId: 7,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a PACKAGE campaign that also carries a promoCodeId', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
      promoCodeId: 7,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a PACKAGE campaign with no packageId', () => {
    const r = CreateCampaignSchema.safeParse({ ...base, targetType: 'PACKAGE' });
    expect(r.success).toBe(false);
  });

  it('rejects a PROMO_CODE campaign carrying packageId instead', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PROMO_CODE',
      packageId: 3,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a non-URL imageUrl', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      imageUrl: 'not-a-url',
      targetType: 'PACKAGE',
      packageId: 3,
    });
    expect(r.success).toBe(false);
  });

  it('rejects endsAt before startsAt', () => {
    const r = CreateCampaignSchema.safeParse({
      ...base,
      targetType: 'PACKAGE',
      packageId: 3,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-08-01T00:00:00.000Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('UpdateCampaignSchema', () => {
  it('requires at least one field', () => {
    expect(UpdateCampaignSchema.safeParse({}).success).toBe(false);
  });

  it('allows a lone sortOrder change', () => {
    expect(UpdateCampaignSchema.safeParse({ sortOrder: 2 }).success).toBe(true);
  });

  it('rejects switching to PACKAGE while supplying a promoCodeId', () => {
    const r = UpdateCampaignSchema.safeParse({ targetType: 'PACKAGE', promoCodeId: 7 });
    expect(r.success).toBe(false);
  });
});
