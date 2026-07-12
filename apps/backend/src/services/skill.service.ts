import type { CreateSkillInput, PublicSkill, Skill, UpdateSkillInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type SkillRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full catalog for the admin site (includes inactive skills). */
export async function listSkills(): Promise<Skill[]> {
  const rows = await prisma.skill.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return rows.map(toDto);
}

/** Active-only catalog for public/mobile consumers (search filter). */
export async function listActiveSkills(): Promise<PublicSkill[]> {
  const rows = await prisma.skill.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return rows;
}

export async function createSkill(input: CreateSkillInput): Promise<Skill> {
  const existing = await prisma.skill.findUnique({ where: { name: input.name } });
  if (existing && existing.deletedAt === null) {
    throw errors.conflict(`Skill "${input.name}" already exists`);
  }
  const row = await prisma.skill.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
    },
  });
  return toDto(row);
}

export async function updateSkill(id: string, input: UpdateSkillInput): Promise<Skill> {
  const existing = await prisma.skill.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Skill not found');

  // Guard the unique name when renaming to one another live skill already holds.
  if (input.name !== undefined && input.name !== existing.name) {
    const clash = await prisma.skill.findUnique({ where: { name: input.name } });
    if (clash && clash.deletedAt === null) {
      throw errors.conflict(`Skill "${input.name}" already exists`);
    }
  }

  const row = await prisma.skill.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return toDto(row);
}

export async function deleteSkill(id: string): Promise<{ id: string }> {
  const existing = await prisma.skill.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Skill not found');
  await prisma.skill.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}
