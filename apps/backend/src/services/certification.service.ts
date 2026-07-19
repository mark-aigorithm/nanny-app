import type {
  Certification,
  CreateCertificationInput,
  PublicCertification,
  UpdateCertificationInput,
} from '@nanny-app/shared';
import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

type CertificationRow = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toDto(row: CertificationRow): Certification {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Full catalog for the admin site (includes inactive certifications). */
export async function listCertifications(): Promise<Certification[]> {
  const rows = await prisma.certification.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });
  return rows.map(toDto);
}

/** Active-only catalog for public/mobile consumers (nanny self-service picker). */
export async function listActiveCertifications(): Promise<PublicCertification[]> {
  const rows = await prisma.certification.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function createCertification(
  input: CreateCertificationInput,
): Promise<Certification> {
  const existing = await prisma.certification.findUnique({ where: { name: input.name } });
  if (existing && existing.deletedAt === null) {
    throw errors.conflict(`Certification "${input.name}" already exists`);
  }
  const row = await prisma.certification.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
    },
  });
  return toDto(row);
}

export async function updateCertification(
  id: number,
  input: UpdateCertificationInput,
): Promise<Certification> {
  const existing = await prisma.certification.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Certification not found');

  // Guard the unique name when renaming to one another live certification already holds.
  if (input.name !== undefined && input.name !== existing.name) {
    const clash = await prisma.certification.findUnique({ where: { name: input.name } });
    if (clash && clash.deletedAt === null) {
      throw errors.conflict(`Certification "${input.name}" already exists`);
    }
  }

  const row = await prisma.certification.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return toDto(row);
}

export async function deleteCertification(id: number): Promise<{ id: number }> {
  const existing = await prisma.certification.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Certification not found');
  await prisma.certification.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/**
 * Reconcile a nanny's certification links to exactly `certificationIds`, run
 * inside a caller-provided transaction (the nanny self-service profile update).
 * Only active, non-deleted catalog ids may be assigned. Rows no longer wanted
 * are soft-deleted; previously soft-deleted rows are reactivated because the
 * `@@unique([nannyProfileId, certificationId])` constraint spans soft-deleted
 * rows, so a plain create would collide.
 */
export async function reconcileNannyCertifications(
  tx: Prisma.TransactionClient,
  nannyProfileId: number,
  certificationIds: number[],
): Promise<void> {
  const desiredIds = [...new Set(certificationIds)];

  const existingRows = await tx.nannyCertification.findMany({
    where: { nannyProfileId },
    select: { id: true, certificationId: true, deletedAt: true },
  });
  const activeLinkedIds = new Set(
    existingRows.filter((r) => r.deletedAt === null).map((r) => r.certificationId),
  );

  // Only newly-added certifications must exist and be active. Certifications the
  // nanny already holds are kept even if an admin later deactivates them, so a
  // stale tag never blocks her from saving the rest of her profile.
  const toValidate = desiredIds.filter((id) => !activeLinkedIds.has(id));
  if (toValidate.length > 0) {
    const valid = await tx.certification.findMany({
      where: { id: { in: toValidate }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (valid.length !== toValidate.length) {
      throw errors.badRequest('One or more certifications are invalid or inactive.');
    }
  }

  const desired = new Set(desiredIds);
  const byCertId = new Map(existingRows.map((r) => [r.certificationId, r]));

  // Soft-delete rows that are currently active but no longer wanted.
  const toRemove = existingRows
    .filter((r) => r.deletedAt === null && !desired.has(r.certificationId))
    .map((r) => r.id);
  if (toRemove.length > 0) {
    await tx.nannyCertification.updateMany({
      where: { id: { in: toRemove } },
      data: { deletedAt: new Date() },
    });
  }

  // Add or reactivate the desired certifications.
  for (const certificationId of desiredIds) {
    const row = byCertId.get(certificationId);
    if (!row) {
      await tx.nannyCertification.create({ data: { nannyProfileId, certificationId } });
    } else if (row.deletedAt !== null) {
      await tx.nannyCertification.update({ where: { id: row.id }, data: { deletedAt: null } });
    }
  }
}
