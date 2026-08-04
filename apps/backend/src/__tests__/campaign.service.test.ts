jest.mock('@backend/db/prisma', () => ({
  prisma: {
    campaign: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    package: { findFirst: jest.fn() },
    promoCode: { findFirst: jest.fn() },
    packagePurchase: { groupBy: jest.fn() },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  listLiveCampaigns,
  recordClick,
  recordImpression,
  updateCampaign,
} from '@backend/services/campaign.service';

const mockPrisma = prisma as unknown as {
  campaign: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  package: { findFirst: jest.Mock };
  promoCode: { findFirst: jest.Mock };
  packagePurchase: { groupBy: jest.Mock };
};

const activePackage = { id: 3, name: 'Starter', isActive: true, deletedAt: null, expiresAt: null, usageCount: 0 };
const activePromo = { id: 7, code: 'WELCOME10', isActive: true, deletedAt: null, expiresAt: null, usageCount: 12 };

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: 'Summer offer',
    subtitle: null,
    imageUrl: 'https://cdn/x.jpg',
    targetType: 'PROMO_CODE',
    packageId: null,
    promoCodeId: 7,
    isActive: true,
    startsAt: null,
    endsAt: null,
    sortOrder: 0,
    impressionCount: 0,
    clickCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    package: null,
    promoCode: { ...activePromo },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.packagePurchase.groupBy.mockResolvedValue([]);
});

describe('createCampaign', () => {
  it('creates a PROMO_CODE campaign when the promo is active', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(activePromo);
    mockPrisma.campaign.create.mockResolvedValue(campaignRow());

    const result = await createCampaign({
      title: 'Summer offer',
      imageUrl: 'https://cdn/x.jpg',
      targetType: 'PROMO_CODE',
      promoCodeId: 7,
      isActive: true,
      sortOrder: 0,
    });

    expect(result.targetName).toBe('WELCOME10');
    expect(result.promoCodeId).toBe(7);
    expect(mockPrisma.campaign.create).toHaveBeenCalled();
  });

  it('throws notFound (404) when the promo target does not exist', async () => {
    mockPrisma.promoCode.findFirst.mockResolvedValue(null);
    await expect(
      createCampaign({
        title: 'x', imageUrl: 'https://cdn/x.jpg', targetType: 'PROMO_CODE', promoCodeId: 99, isActive: true, sortOrder: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws badRequest (400) when the package target is inactive', async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ ...activePackage, isActive: false });
    await expect(
      createCampaign({
        title: 'x', imageUrl: 'https://cdn/x.jpg', targetType: 'PACKAGE', packageId: 3, isActive: true, sortOrder: 0,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('updateCampaign', () => {
  it('throws notFound (404) when the campaign is missing', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);
    await expect(updateCampaign(1, { title: 'new' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('re-validates the target when target fields change', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(campaignRow());
    mockPrisma.package.findFirst.mockResolvedValue(activePackage);
    mockPrisma.campaign.update.mockResolvedValue(
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    );

    const result = await updateCampaign(1, { targetType: 'PACKAGE', packageId: 3 });
    expect(mockPrisma.package.findFirst).toHaveBeenCalled();
    expect(result.targetName).toBe('Starter');
  });
});

describe('deleteCampaign', () => {
  it('soft-deletes an existing campaign', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(campaignRow());
    mockPrisma.campaign.update.mockResolvedValue(campaignRow());
    const r = await deleteCampaign(1);
    expect(r).toEqual({ id: 1 });
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });
});

describe('listCampaigns', () => {
  it('resolves targetName and targetUsageCount (promo → usageCount)', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([campaignRow()]);
    const [row] = await listCampaigns();
    expect(row?.targetName).toBe('WELCOME10');
    expect(row?.targetUsageCount).toBe(12);
  });

  it('resolves package usage from grouped purchase counts', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    ]);
    mockPrisma.packagePurchase.groupBy.mockResolvedValue([{ packageId: 3, _count: { _all: 5 } }]);
    const [row] = await listCampaigns();
    expect(row?.targetName).toBe('Starter');
    expect(row?.targetUsageCount).toBe(5);
  });
});

describe('listLiveCampaigns', () => {
  it('maps a promo campaign to its code and drops dead-target rows', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow(),
      campaignRow({ id: 2, promoCode: { ...activePromo, id: 8, isActive: false } }),
    ]);
    const result = await listLiveCampaigns();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, promoCode: 'WELCOME10', packageId: null });
  });

  it('maps a package campaign to its packageId', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([
      campaignRow({ targetType: 'PACKAGE', packageId: 3, promoCodeId: null, package: activePackage, promoCode: null }),
    ]);
    const result = await listLiveCampaigns();
    expect(result[0]).toMatchObject({ packageId: 3, promoCode: null });
  });
});

describe('counters', () => {
  it('recordImpression increments impressionCount', async () => {
    mockPrisma.campaign.update.mockResolvedValue({});
    await recordImpression(1);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { impressionCount: { increment: 1 } },
    });
  });

  it('recordClick swallows a not-found update', async () => {
    mockPrisma.campaign.update.mockRejectedValue(new Error('Record to update not found.'));
    await expect(recordClick(999)).resolves.toBeUndefined();
  });
});
