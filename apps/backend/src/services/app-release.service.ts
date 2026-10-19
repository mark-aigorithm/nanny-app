import {
  compareVersions,
  isSemver,
  type AppPlatform,
  type AppRelease,
  type AppVersionCheckQuery,
  type AppVersionCheckResult,
  type CreateAppReleaseInput,
  type UpdateAppReleaseInput,
} from '@nanny-app/shared';
import type { DevicePlatform } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { errors } from '@backend/lib/errors';

type AppReleaseRow = {
  id: number;
  platform: DevicePlatform;
  version: string;
  mandatory: boolean;
  releaseNotes: string | null;
  createdAt: Date;
};

const TO_PRISMA: Record<AppPlatform, DevicePlatform> = { ios: 'IOS', android: 'ANDROID' };
const FROM_PRISMA: Record<DevicePlatform, AppPlatform> = { IOS: 'ios', ANDROID: 'android' };

function toDto(row: AppReleaseRow): AppRelease {
  return {
    id: row.id,
    platform: FROM_PRISMA[row.platform],
    version: row.version,
    mandatory: row.mandatory,
    releaseNotes: row.releaseNotes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAppReleases(): Promise<AppRelease[]> {
  const rows = await prisma.appRelease.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDto);
}

export async function createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease> {
  const platform = TO_PRISMA[input.platform];
  const clash = await prisma.appRelease.findFirst({
    where: { platform, version: input.version, deletedAt: null },
  });
  if (clash) {
    throw errors.conflict(`Version ${input.version} is already recorded for ${input.platform}`);
  }
  const row = await prisma.appRelease.create({
    data: {
      platform,
      version: input.version,
      mandatory: input.mandatory,
      releaseNotes: input.releaseNotes || null,
    },
  });
  return toDto(row);
}

export async function updateAppRelease(
  id: number,
  input: UpdateAppReleaseInput,
): Promise<AppRelease> {
  const existing = await prisma.appRelease.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Release not found');
  const row = await prisma.appRelease.update({
    where: { id },
    data: {
      ...(input.mandatory !== undefined && { mandatory: input.mandatory }),
      ...(input.releaseNotes !== undefined && { releaseNotes: input.releaseNotes || null }),
    },
  });
  return toDto(row);
}

export async function deleteAppRelease(id: number): Promise<{ id: number }> {
  const existing = await prisma.appRelease.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw errors.notFound('Release not found');
  await prisma.appRelease.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

/**
 * What the app should do about its installed version. Fails open: a client
 * version that isn't x.y.z, or a platform with nothing recorded, is "ok" —
 * a bad build or an empty table must never lock anyone out.
 */
export async function checkAppVersion(query: AppVersionCheckQuery): Promise<AppVersionCheckResult> {
  const rows = await prisma.appRelease.findMany({
    where: { platform: TO_PRISMA[query.platform], deletedAt: null },
  });
  const newestFirst = [...rows].sort((a, b) => compareVersions(b.version, a.version) ?? 0);
  const latest = newestFirst[0];
  if (!latest || !isSemver(query.version)) {
    return { status: 'ok', latestVersion: latest?.version ?? null, storeUrl: null, releaseNotes: null };
  }

  const latestMandatory = newestFirst.find((r) => r.mandatory);
  const isBelow = (version: string) => compareVersions(query.version, version) === -1;
  const status = latestMandatory && isBelow(latestMandatory.version)
    ? 'update_required'
    : isBelow(latest.version)
      ? 'update_available'
      : 'ok';

  return {
    status,
    latestVersion: latest.version,
    storeUrl: status === 'ok' ? null : config.storeUrls[query.platform],
    releaseNotes: status === 'ok' ? null : latest.releaseNotes,
  };
}
