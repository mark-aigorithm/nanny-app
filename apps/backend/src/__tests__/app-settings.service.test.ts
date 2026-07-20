jest.mock('@backend/db/prisma', () => {
  const appSettings = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  };
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
import { AppError } from '@backend/lib/errors';
import {
  getBroadcastRadiusKm,
  getPlatformConfig,
  getRevealPhoneMinutes,
  updatePlatformConfig,
} from '@backend/services/app-settings.service';

const mockPrisma = prisma as unknown as {
  appSettings: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

/** app_settings rows as the DB would return them. */
const rows = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
});

describe('getBroadcastRadiusKm', () => {
  it('returns the default (10) when the key is not seeded', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue(null);
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
    expect(mockPrisma.appSettings.findFirst).toHaveBeenCalledWith({
      where: { key: 'broadcast_radius_km', deletedAt: null },
    });
  });

  it('parses the stored value', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: '25.5',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(25.5);
  });

  it('falls back to the default on a malformed value', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'broadcast_radius_km',
      value: 'not-a-number',
    });
    await expect(getBroadcastRadiusKm()).resolves.toBe(10);
  });
});

describe('getRevealPhoneMinutes', () => {
  it('returns the default (45) when the key is not seeded', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue(null);
    await expect(getRevealPhoneMinutes()).resolves.toBe(45);
    expect(mockPrisma.appSettings.findFirst).toHaveBeenCalledWith({
      where: { key: 'reveal_phone_minutes', deletedAt: null },
    });
  });

  it('parses the stored value', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'reveal_phone_minutes',
      value: '60',
    });
    await expect(getRevealPhoneMinutes()).resolves.toBe(60);
  });

  it('falls back to the default on a malformed value', async () => {
    mockPrisma.appSettings.findFirst.mockResolvedValue({
      key: 'reveal_phone_minutes',
      value: 'not-a-number',
    });
    await expect(getRevealPhoneMinutes()).resolves.toBe(45);
  });
});

describe('getPlatformConfig', () => {
  it('falls back to defaults when nothing is seeded', async () => {
    const config = await getPlatformConfig();
    // The defaults mirror the hours the picker used to hardcode.
    expect(config.bookingWindowStartHour).toBe(6);
    expect(config.bookingWindowEndHour).toBe(22);
    expect(config.minAdvanceBookingHours).toBe(2);
    expect(config.minBookingHours).toBe(2);
    expect(config.maxBookingHours).toBe(12);
  });

  it('reads the booking window from the DB when present', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({ booking_window_start_hour: '8', booking_window_end_hour: '2' }),
    );
    const config = await getPlatformConfig();
    expect(config.bookingWindowStartHour).toBe(8);
    expect(config.bookingWindowEndHour).toBe(2);
  });

  it('keeps a midnight end hour rather than treating 0 as unset', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(rows({ booking_window_end_hour: '0' }));
    expect((await getPlatformConfig()).bookingWindowEndHour).toBe(0);
  });

  it('ignores an unparseable value and uses the default', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(rows({ booking_window_start_hour: 'abc' }));
    expect((await getPlatformConfig()).bookingWindowStartHour).toBe(6);
  });

  it('includes matching/SLA defaults for unseeded keys', async () => {
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(10);
    expect(config.pendingWarningMinutes).toBe(15);
    expect(config.pendingCriticalMinutes).toBe(30);
  });

  it('reads seeded matching/SLA values', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(
      rows({
        broadcast_radius_km: '5',
        pending_warning_minutes: '20',
        pending_critical_minutes: '45',
      }),
    );
    const config = await getPlatformConfig();
    expect(config.broadcastRadiusKm).toBe(5);
    expect(config.pendingWarningMinutes).toBe(20);
    expect(config.pendingCriticalMinutes).toBe(45);
  });
});

describe('updatePlatformConfig — coherence guard', () => {
  it('accepts a coherent change', async () => {
    await expect(updatePlatformConfig({ bookingWindowStartHour: 8 })).resolves.toBeDefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('rejects a minimum longer than the maximum', async () => {
    await expect(updatePlatformConfig({ minBookingHours: 20 })).rejects.toThrow(AppError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('catches an incoherent merge even when only one side is sent', async () => {
    // The saved max is 4; raising only the minimum to 6 is invalid, but a refine
    // on the .partial() request schema can't see the max to know that.
    mockPrisma.appSettings.findMany.mockResolvedValue(rows({ max_booking_hours: '4' }));
    await expect(updatePlatformConfig({ minBookingHours: 6 })).rejects.toThrow(
      'Min booking hours cannot exceed max booking hours.',
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a window too short for the minimum booking', async () => {
    // 23:00 → 01:00 is a 2-hour window; a 4-hour minimum leaves nothing bookable.
    mockPrisma.appSettings.findMany.mockResolvedValue(rows({ min_booking_hours: '4' }));
    await expect(
      updatePlatformConfig({ bookingWindowStartHour: 23, bookingWindowEndHour: 1 }),
    ).rejects.toThrow(/booking window is only 2 hours long/i);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a cross-midnight window that comfortably fits the minimum', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue(rows({ min_booking_hours: '2' }));
    await expect(
      updatePlatformConfig({ bookingWindowStartHour: 8, bookingWindowEndHour: 2 }),
    ).resolves.toBeDefined();
  });

  it('allows a full-24h window', async () => {
    await expect(
      updatePlatformConfig({ bookingWindowStartHour: 0, bookingWindowEndHour: 0 }),
    ).resolves.toBeDefined();
  });
});
