import { ApprovalStatus, Prisma } from '@prisma/client';

import type {
  AdminNannyCamera,
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
async function assertApprovedNanny(userId: number): Promise<void> {
  const profile = await prisma.nannyProfile.findFirst({
    where: {
      userId,
      deletedAt: null,
      user: { deletedAt: null, approvalStatus: ApprovalStatus.APPROVED },
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
  id: number,
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

export async function deleteCamera(id: number): Promise<{ id: number }> {
  const existing = await prisma.camera.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Camera not found');
  await prisma.camera.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/**
 * Give a nanny a camera from the free pool, or take hers away (`cameraId`
 * null). Parents only ever see a nanny's newest camera, so the console keeps
 * it to one: any other camera she held goes back to the pool in the same
 * transaction.
 */
export async function assignNannyCamera(
  nannyProfileId: number,
  cameraId: number | null,
): Promise<AdminNannyCamera | null> {
  const profile = await prisma.nannyProfile.findFirst({
    where: { id: nannyProfileId, deletedAt: null, user: { deletedAt: null } },
    select: { userId: true, user: { select: { approvalStatus: true } } },
  });
  if (!profile) throw errors.notFound('Nanny not found');
  const { userId } = profile;

  if (cameraId === null) {
    await prisma.camera.updateMany({
      where: { nannyUserId: userId, deletedAt: null },
      data: { nannyUserId: null },
    });
    return null;
  }

  // Same rule as assigning from the Cameras page.
  if (profile.user.approvalStatus !== ApprovalStatus.APPROVED) {
    throw errors.badRequest('Only an approved nanny can be given a camera.');
  }

  const camera = await prisma.camera.findFirst({
    where: { id: cameraId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!camera) throw errors.notFound('Camera not found');

  await prisma.$transaction(async (tx) => {
    // Claimed only while it's still free (or already hers), so two admins
    // picking the same camera can't both get it.
    const claimed = await tx.camera.updateMany({
      where: {
        id: camera.id,
        deletedAt: null,
        OR: [{ nannyUserId: null }, { nannyUserId: userId }],
      },
      data: { nannyUserId: userId },
    });
    if (claimed.count === 0) {
      throw errors.conflict('That camera is already assigned to another nanny.');
    }
    await tx.camera.updateMany({
      where: { nannyUserId: userId, deletedAt: null, id: { not: camera.id } },
      data: { nannyUserId: null },
    });
  });
  return camera;
}

export async function listNannyOptions(): Promise<NannyOption[]> {
  const rows = await prisma.nannyProfile.findMany({
    where: {
      deletedAt: null,
      user: { deletedAt: null, approvalStatus: ApprovalStatus.APPROVED },
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
