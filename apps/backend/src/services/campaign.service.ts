import { PackagePurchaseStatus, type Prisma } from '@prisma/client';

import type {
  Campaign,
  CampaignTargetType,
  CreateCampaignInput,
  PublicCampaign,
  UpdateCampaignInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type TargetPackage = { id: number; name: string; isActive: boolean; deletedAt: Date | null; expiresAt: Date | null } | null;
type TargetPromo = { id: number; code: string; isActive: boolean; deletedAt: Date | null; expiresAt: Date | null; usageCount: number } | null;

type CampaignRow = {
  id: number;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  targetType: CampaignTargetType;
  packageId: number | null;
  promoCodeId: number | null;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  sortOrder: number;
  impressionCount: number;
  clickCount: number;
  createdAt: Date;
  package: TargetPackage;
  promoCode: TargetPromo;
};

const includeTargets = { package: true, promoCode: true } as const;

function targetName(row: CampaignRow): string {
  if (row.targetType === 'PACKAGE') return row.package?.name ?? '(deleted package)';
  return row.promoCode?.code ?? '(deleted promo code)';
}

function toDto(row: CampaignRow, packageUsage: Map<number, number>): Campaign {
  const targetUsageCount =
    row.targetType === 'PROMO_CODE'
      ? row.promoCode?.usageCount ?? 0
      : (row.packageId != null ? packageUsage.get(row.packageId) ?? 0 : 0);
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    targetType: row.targetType,
    packageId: row.packageId,
    promoCodeId: row.promoCodeId,
    targetName: targetName(row),
    isActive: row.isActive,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    sortOrder: row.sortOrder,
    impressionCount: row.impressionCount,
    clickCount: row.clickCount,
    targetUsageCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Batch-count paid purchases for the package-target campaigns in one query. */
async function packageUsageFor(rows: CampaignRow[]): Promise<Map<number, number>> {
  const ids = rows
    .filter((r) => r.targetType === 'PACKAGE' && r.packageId != null)
    .map((r) => r.packageId as number);
  if (ids.length === 0) return new Map();
  const grouped = await prisma.packagePurchase.groupBy({
    by: ['packageId'],
    where: { packageId: { in: ids }, deletedAt: null, status: { not: PackagePurchaseStatus.PENDING_PAYMENT } },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.packageId, g._count._all]));
}

/** Validate the chosen target exists, is active and undeleted, matching targetType. */
async function assertTargetUsable(
  targetType: CampaignTargetType,
  packageId: number | null | undefined,
  promoCodeId: number | null | undefined,
): Promise<void> {
  if (targetType === 'PACKAGE') {
    const pkg = await prisma.package.findFirst({ where: { id: packageId ?? -1, deletedAt: null } });
    if (!pkg) throw errors.notFound('Linked package not found');
    if (!pkg.isActive) throw errors.badRequest('Linked package is inactive');
    return;
  }
  const promo = await prisma.promoCode.findFirst({ where: { id: promoCodeId ?? -1, deletedAt: null } });
  if (!promo) throw errors.notFound('Linked promo code not found');
  if (!promo.isActive) throw errors.badRequest('Linked promo code is inactive');
}

export async function listCampaigns(): Promise<Campaign[]> {
  const rows = (await prisma.campaign.findMany({
    where: { deletedAt: null },
    include: includeTargets,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as CampaignRow[];
  const usage = await packageUsageFor(rows);
  return rows.map((r) => toDto(r, usage));
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  await assertTargetUsable(input.targetType, input.packageId, input.promoCodeId);
  const row = (await prisma.campaign.create({
    data: {
      title: input.title,
      subtitle: input.subtitle ?? null,
      imageUrl: input.imageUrl,
      targetType: input.targetType,
      packageId: input.targetType === 'PACKAGE' ? input.packageId ?? null : null,
      promoCodeId: input.targetType === 'PROMO_CODE' ? input.promoCodeId ?? null : null,
      isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      sortOrder: input.sortOrder,
    },
    include: includeTargets,
  })) as unknown as CampaignRow;
  const usage = await packageUsageFor([row]);
  return toDto(row, usage);
}

export async function updateCampaign(id: number, input: UpdateCampaignInput): Promise<Campaign> {
  const existing = (await prisma.campaign.findFirst({
    where: { id, deletedAt: null },
    include: includeTargets,
  })) as unknown as CampaignRow | null;
  if (!existing) throw errors.notFound('Campaign not found');

  // Re-validate the target when targetType or either id is being changed.
  const nextType = input.targetType ?? existing.targetType;
  const targetChanged =
    input.targetType !== undefined ||
    input.packageId !== undefined ||
    input.promoCodeId !== undefined;
  if (targetChanged) {
    const nextPackageId = nextType === 'PACKAGE' ? input.packageId ?? existing.packageId : null;
    const nextPromoId = nextType === 'PROMO_CODE' ? input.promoCodeId ?? existing.promoCodeId : null;
    await assertTargetUsable(nextType, nextPackageId, nextPromoId);
  }

  const data: Prisma.CampaignUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.subtitle !== undefined && { subtitle: input.subtitle ?? null }),
    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.startsAt !== undefined && { startsAt: input.startsAt ? new Date(input.startsAt) : null }),
    ...(input.endsAt !== undefined && { endsAt: input.endsAt ? new Date(input.endsAt) : null }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
  };
  if (targetChanged) {
    data.targetType = nextType;
    data.package = nextType === 'PACKAGE' && (input.packageId ?? existing.packageId) != null
      ? { connect: { id: (input.packageId ?? existing.packageId) as number } }
      : { disconnect: true };
    data.promoCode = nextType === 'PROMO_CODE' && (input.promoCodeId ?? existing.promoCodeId) != null
      ? { connect: { id: (input.promoCodeId ?? existing.promoCodeId) as number } }
      : { disconnect: true };
  }

  const row = (await prisma.campaign.update({
    where: { id },
    data,
    include: includeTargets,
  })) as unknown as CampaignRow;
  const usage = await packageUsageFor([row]);
  return toDto(row, usage);
}

export async function deleteCampaign(id: number): Promise<{ id: number }> {
  const existing = await prisma.campaign.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Campaign not found');
  await prisma.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/** True when the campaign's linked target is itself usable (active, undeleted, unexpired). */
function targetLive(row: CampaignRow, now: Date): boolean {
  const t = row.targetType === 'PACKAGE' ? row.package : row.promoCode;
  if (!t) return false;
  if (!t.isActive || t.deletedAt != null) return false;
  if (t.expiresAt != null && t.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

function toPublicDto(row: CampaignRow): PublicCampaign {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    targetType: row.targetType,
    packageId: row.targetType === 'PACKAGE' ? row.packageId : null,
    promoCode: row.targetType === 'PROMO_CODE' ? row.promoCode?.code ?? null : null,
  };
}

export async function listLiveCampaigns(): Promise<PublicCampaign[]> {
  const now = new Date();
  const rows = (await prisma.campaign.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    include: includeTargets,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })) as unknown as CampaignRow[];
  return rows.filter((r) => targetLive(r, now)).map(toPublicDto);
}

async function bumpCounter(id: number, field: 'impressionCount' | 'clickCount'): Promise<void> {
  try {
    await prisma.campaign.update({ where: { id }, data: { [field]: { increment: 1 } } });
  } catch {
    // Best-effort: a tap on a since-deleted campaign must not error the client.
  }
}

export async function recordImpression(id: number): Promise<void> {
  await bumpCounter(id, 'impressionCount');
}

export async function recordClick(id: number): Promise<void> {
  await bumpCounter(id, 'clickCount');
}
