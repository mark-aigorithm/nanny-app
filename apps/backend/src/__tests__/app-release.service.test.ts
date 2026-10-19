jest.mock('@backend/db/prisma', () => ({
  prisma: {
    appRelease: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// The real config validates the whole environment (Firebase keys, DB url) at
// import time; the service only needs the store links.
jest.mock('@backend/lib/config', () => ({
  config: {
    storeUrls: {
      ios: 'https://apps.apple.com/app/id6797044436',
      android: 'https://play.google.com/store/apps/details?id=com.nannyapp.mobile',
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import {
  checkAppVersion,
  createAppRelease,
  deleteAppRelease,
  listAppReleases,
  updateAppRelease,
} from '@backend/services/app-release.service';

const mockPrisma = prisma as unknown as {
  appRelease: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
};

const IOS_STORE = 'https://apps.apple.com/app/id6797044436';

function makeRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    platform: 'IOS',
    version: '1.0.0',
    mandatory: false,
    releaseNotes: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkAppVersion', () => {
  const check = (version: string) => checkAppVersion({ platform: 'ios', version });

  it('reads only live releases for the asked platform', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([]);
    await check('1.0.0');
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { platform: 'IOS', deletedAt: null },
    });
  });

  it('is ok with no releases recorded', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([]);
    expect(await check('1.0.0')).toEqual({
      status: 'ok',
      latestVersion: null,
      storeUrl: null,
      releaseNotes: null,
    });
  });

  it('is ok on the latest release', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '1.2.0', mandatory: true })]);
    expect((await check('1.2.0')).status).toBe('ok');
  });

  it('is ok when ahead of every release (e.g. a TestFlight build)', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '1.2.0', mandatory: true })]);
    expect((await check('1.3.0')).status).toBe('ok');
  });

  it('offers an optional update with the latest notes and store link', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.0.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.1.0', releaseNotes: 'Faster booking' }),
    ]);
    expect(await check('1.0.0')).toEqual({
      status: 'update_available',
      latestVersion: '1.1.0',
      storeUrl: IOS_STORE,
      releaseNotes: 'Faster booking',
    });
  });

  it('requires an update below the newest mandatory release, even when a newer optional one exists', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.1.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.2.0', mandatory: false, releaseNotes: 'Latest' }),
    ]);
    const result = await check('1.0.5');
    expect(result.status).toBe('update_required');
    expect(result.latestVersion).toBe('1.2.0');
    expect(result.storeUrl).toBe(IOS_STORE);
  });

  it('only offers an update when above the mandatory floor but below the latest', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.1.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.2.0' }),
    ]);
    expect((await check('1.1.0')).status).toBe('update_available');
  });

  it('compares numerically: 1.10.0 is newer than 1.9.0', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ id: 1, version: '1.10.0', mandatory: true }),
      makeRelease({ id: 2, version: '1.9.0', mandatory: true }),
    ]);
    expect((await check('1.9.0')).status).toBe('update_required');
    expect((await check('1.10.0')).status).toBe('ok');
  });

  it.each(['1.4', '1.4.0-beta', '', 'garbage'])('fails open on a malformed client version %p', async (version) => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ version: '9.0.0', mandatory: true })]);
    expect((await check(version)).status).toBe('ok');
  });

  it('uses the Android store link for Android', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([
      makeRelease({ platform: 'ANDROID', version: '2.0.0', mandatory: true }),
    ]);
    const result = await checkAppVersion({ platform: 'android', version: '1.0.0' });
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { platform: 'ANDROID', deletedAt: null },
    });
    expect(result.storeUrl).toBe('https://play.google.com/store/apps/details?id=com.nannyapp.mobile');
  });
});

describe('listAppReleases', () => {
  it('returns live releases as DTOs with lower-case platforms', async () => {
    mockPrisma.appRelease.findMany.mockResolvedValue([makeRelease({ platform: 'ANDROID' })]);
    expect(await listAppReleases()).toEqual([
      {
        id: 1,
        platform: 'android',
        version: '1.0.0',
        mandatory: false,
        releaseNotes: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
    expect(mockPrisma.appRelease.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('createAppRelease', () => {
  it('creates a release', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(null);
    mockPrisma.appRelease.create.mockResolvedValue(makeRelease({ version: '1.4.0', mandatory: true }));
    const created = await createAppRelease({ platform: 'ios', version: '1.4.0', mandatory: true });
    expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
      data: { platform: 'IOS', version: '1.4.0', mandatory: true, releaseNotes: null },
    });
    expect(created.version).toBe('1.4.0');
  });

  it('refuses a duplicate live version on the same platform', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease({ version: '1.4.0' }));
    await expect(
      createAppRelease({ platform: 'ios', version: '1.4.0', mandatory: false }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.appRelease.findFirst).toHaveBeenCalledWith({
      where: { platform: 'IOS', version: '1.4.0', deletedAt: null },
    });
  });
});

describe('updateAppRelease', () => {
  it('changes mandatory and notes only', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease());
    mockPrisma.appRelease.update.mockResolvedValue(makeRelease({ mandatory: true, releaseNotes: null }));
    await updateAppRelease(1, { mandatory: true, releaseNotes: null });
    expect(mockPrisma.appRelease.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { mandatory: true, releaseNotes: null },
    });
  });

  it('404s on a missing release', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(null);
    await expect(updateAppRelease(99, { mandatory: true })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('deleteAppRelease', () => {
  it('soft-deletes', async () => {
    mockPrisma.appRelease.findFirst.mockResolvedValue(makeRelease());
    expect(await deleteAppRelease(1)).toEqual({ id: 1 });
    expect(mockPrisma.appRelease.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
