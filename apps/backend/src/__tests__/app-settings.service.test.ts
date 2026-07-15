jest.mock('@backend/db/prisma', () => ({
  prisma: {
    appSettings: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  },
}));

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { getPlatformConfig, updatePlatformConfig } from '@backend/services/app-settings.service';

const mockPrisma = prisma as unknown as {
  appSettings: { findMany: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
};

/** app_settings rows as the DB would return them. */
const rows = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => ({ key, value }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.appSettings.findMany.mockResolvedValue([]);
  mockPrisma.$transaction.mockResolvedValue([]);
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
});

describe('updatePlatformConfig — coherence guard', () => {
  it('accepts a coherent change', async () => {
    mockPrisma.appSettings.findMany.mockResolvedValue([]);
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
