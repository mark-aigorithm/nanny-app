import type {
  CreateDurationRuleInput,
  DurationRule,
  PublicDurationRule,
  UpdateDurationRuleInput,
} from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type DurationRuleRow = {
  id: string;
  minHours: number;
  multiplier: Prisma.Decimal;
  label: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toDto(row: DurationRuleRow): DurationRule {
  return {
    id: row.id,
    minHours: row.minHours,
    multiplier: Number(row.multiplier),
    label: row.label,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full list for the admin site (includes inactive tiers), lowest tier first. */
export async function listDurationRules(): Promise<DurationRule[]> {
  const rows = await prisma.durationMultiplierRule.findMany({
    where: { deletedAt: null },
    orderBy: { minHours: 'asc' },
  });
  return rows.map(toDto);
}

/** Active-only tiers for pricing, lowest tier first. */
export async function listActiveDurationRules(): Promise<PublicDurationRule[]> {
  const rows = await prisma.durationMultiplierRule.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { minHours: 'asc' },
    select: { minHours: true, multiplier: true, label: true },
  });
  return rows.map((r) => ({
    minHours: r.minHours,
    multiplier: Number(r.multiplier),
    label: r.label,
  }));
}

export async function createDurationRule(
  input: CreateDurationRuleInput,
): Promise<DurationRule> {
  const clash = await prisma.durationMultiplierRule.findFirst({
    where: { minHours: input.minHours, deletedAt: null },
  });
  if (clash) throw errors.conflict(`A tier for ${input.minHours}h already exists`);

  const row = await prisma.durationMultiplierRule.create({
    data: {
      minHours: input.minHours,
      multiplier: input.multiplier,
      label: input.label ?? null,
      isActive: input.isActive,
    },
  });
  return toDto(row);
}

export async function updateDurationRule(
  id: string,
  input: UpdateDurationRuleInput,
): Promise<DurationRule> {
  const existing = await prisma.durationMultiplierRule.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw errors.notFound('Duration rule not found');

  if (input.minHours !== undefined && input.minHours !== existing.minHours) {
    const clash = await prisma.durationMultiplierRule.findFirst({
      where: { minHours: input.minHours, deletedAt: null, id: { not: id } },
    });
    if (clash) throw errors.conflict(`A tier for ${input.minHours}h already exists`);
  }

  const row = await prisma.durationMultiplierRule.update({
    where: { id },
    data: {
      ...(input.minHours !== undefined && { minHours: input.minHours }),
      ...(input.multiplier !== undefined && { multiplier: input.multiplier }),
      ...(input.label !== undefined && { label: input.label ?? null }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return toDto(row);
}

export async function deleteDurationRule(id: string): Promise<{ id: string }> {
  const existing = await prisma.durationMultiplierRule.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw errors.notFound('Duration rule not found');
  await prisma.durationMultiplierRule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return { id };
}
