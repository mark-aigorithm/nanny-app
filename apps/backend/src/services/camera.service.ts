import { NannyApprovalStatus, Prisma } from '@prisma/client';

import type {
  Camera,
  CreateCameraInput,
  NannyOption,
  UpdateCameraInput,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

const cameraInclude = {
  nannyUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.CameraInclude;

type CameraRow = Prisma.CameraGetPayload<{ include: typeof cameraInclude }>;

function toDto(row: CameraRow): Camera {
  return {
    id: row.id,
    name: row.name,
    streamUrl: row.streamUrl,
    nannyUserId: row.nannyUserId,
    nannyName: row.nannyUser
      ? `${row.nannyUser.firstName} ${row.nannyUser.lastName}`.trim()
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Ensure the given user id belongs to an existing, approved nanny. */
async function assertApprovedNanny(userId: string): Promise<void> {
  const profile = await prisma.nannyProfile.findFirst({
    where: {
      userId,
      deletedAt: null,
      approvalStatus: NannyApprovalStatus.APPROVED,
      user: { deletedAt: null },
    },
    select: { id: true },
  });
  if (!profile) throw errors.badRequest('Selected nanny is not an approved nanny.');
}

export async function listCameras(): Promise<Camera[]> {
  const rows = await prisma.camera.findMany({
    where: { deletedAt: null },
    include: cameraInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function createCamera(input: CreateCameraInput): Promise<Camera> {
  if (input.nannyUserId) await assertApprovedNanny(input.nannyUserId);

  const row = await prisma.camera.create({
    data: {
      name: input.name,
      streamUrl: input.streamUrl,
      nannyUserId: input.nannyUserId ?? null,
    },
    include: cameraInclude,
  });
  return toDto(row);
}

export async function updateCamera(
  id: string,
  input: UpdateCameraInput,
): Promise<Camera> {
  const existing = await prisma.camera.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Camera not found');

  if (input.nannyUserId) await assertApprovedNanny(input.nannyUserId);

  const row = await prisma.camera.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.streamUrl !== undefined && { streamUrl: input.streamUrl }),
      ...(input.nannyUserId !== undefined && { nannyUserId: input.nannyUserId }),
    },
    include: cameraInclude,
  });
  return toDto(row);
}

export async function deleteCamera(id: string): Promise<{ id: string }> {
  const existing = await prisma.camera.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Camera not found');
  await prisma.camera.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

export async function listNannyOptions(): Promise<NannyOption[]> {
  const rows = await prisma.nannyProfile.findMany({
    where: {
      deletedAt: null,
      approvalStatus: NannyApprovalStatus.APPROVED,
      user: { deletedAt: null },
    },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map((row) => ({
    userId: row.user.id,
    name: `${row.user.firstName} ${row.user.lastName}`.trim(),
  }));
}
