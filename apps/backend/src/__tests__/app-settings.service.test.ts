jest.mock('@backend/db/prisma', () => {
  const appSettings = { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() };
  return {
    prisma: {
      appSettings,
      $transaction: jest.fn(async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as () => unknown)(),
      ),
    },
  };
});

import { prisma } from '@backend/db/prisma';
import {
  getBroadcastRadiusKm,
  getPlatformConfig,
} from '@backend/services/app-settings.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getBroadcastRadiusKm', () => {
  it('returns the default (10) when the key is not seeded', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue(null);
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
  });

  it('parses the stored value', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: '25.5',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(25.5);
  });

  it('falls back to the default on a malformed value', async () => {
    mockPrisma.appSettings.findUnique.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: 'not-a-number',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
  });
});

describe('getPlatformConfig — matching/SLA keys', () => {
  it('includes matching/SLA defaults for unseeded keys', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([]);
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(10);
    expect(config.pendingWarningMinutes).toBe(15);
    expect(config.pendingCriticalMinutes).toBe(30);
  });

  it('reads seeded matching/SLA values', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([
      { key: 'broadcast_radius_km', value: '5' },
      { key: 'pending_warning_minutes', value: '20' },
      { key: 'pending_critical_minutes', value: '45' },
    ]);
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(5);
    expect(config.pendingWarningMinutes).toBe(20);
    expect(config.pendingCriticalMinutes).toBe(45);
  });
});
