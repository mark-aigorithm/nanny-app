import type {
  CreatePackageInput,
  Package,
  UpdatePackageInput,
} from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type PackageRow = {
  id: number;
  name: string;
  description: string | null;
  hours: number;
  price: Prisma.Decimal;
  validityDays: number;
  maxSkills: number;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

function toDto(row: PackageRow): Package {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    hours: row.hours,
    price: Number(row.price),
    validityDays: row.validityDays,
    maxSkills: row.maxSkills,
    isActive: row.isActive,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full catalog for the admin site (includes inactive packages). */
export async function listPackages(): Promise<Package[]> {
  const rows = await prisma.package.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return rows.map(toDto);
}

export async function createPackage(input: CreatePackageInput): Promise<Package> {
  const existing = await prisma.package.findUnique({ where: { name: input.name } });
  if (existing && existing.deletedAt === null) {
    throw errors.conflict(`Package "${input.name}" already exists`);
  }
  const row = await prisma.package.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      hours: input.hours,
      price: input.price,
      validityDays: input.validityDays,
      maxSkills: input.maxSkills,
      isActive: input.isActive,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  return toDto(row);
}

export async function updatePackage(
  id: number,
  input: UpdatePackageInput,
): Promise<Package> {
  const existing = await prisma.package.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Package not found');

  // Guard the unique name when renaming to one another live package already holds.
  if (input.name !== undefined && input.name !== existing.name) {
    const clash = await prisma.package.findUnique({ where: { name: input.name } });
    if (clash && clash.deletedAt === null) {
      throw errors.conflict(`Package "${input.name}" already exists`);
    }
  }

  const row = await prisma.package.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.hours !== undefined && { hours: input.hours }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.validityDays !== undefined && { validityDays: input.validityDays }),
      ...(input.maxSkills !== undefined && { maxSkills: input.maxSkills }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.expiresAt !== undefined && {
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }),
    },
  });
  return toDto(row);
}

export async function deletePackage(id: number): Promise<{ id: number }> {
  const existing = await prisma.package.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Package not found');
  await prisma.package.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}
