import type { PlatformConfig, UpdatePlatformConfigInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const KEYS = {
  SERVICE_FEE_PERCENT: 'service_fee_percent',
  MAX_BOOKING_HOURS: 'max_booking_hours',
  MIN_BOOKING_HOURS: 'min_booking_hours',
  MIN_ADVANCE_BOOKING_HOURS: 'min_advance_booking_hours',
  CANCELLATION_WINDOW_HOURS: 'cancellation_window_hours',
} as const;

const DEFAULTS: PlatformConfig = {
  serviceFeePercent: 6,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
};

/** Maps each PlatformConfig field to its app_settings key. */
const FIELD_TO_KEY: Record<keyof PlatformConfig, string> = {
  serviceFeePercent: KEYS.SERVICE_FEE_PERCENT,
  maxBookingHours: KEYS.MAX_BOOKING_HOURS,
  minBookingHours: KEYS.MIN_BOOKING_HOURS,
  minAdvanceBookingHours: KEYS.MIN_ADVANCE_BOOKING_HOURS,
  cancellationWindowHours: KEYS.CANCELLATION_WINDOW_HOURS,
};

/** Returns the platform service fee % from app_settings (default 6 if not seeded). */
export async function getServiceFeePercent(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.SERVICE_FEE_PERCENT },
  });
  return row ? parseFloat(row.value) : DEFAULTS.serviceFeePercent;
}

/** Returns the full platform config, falling back to defaults for unseeded keys. */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: Object.values(FIELD_TO_KEY) }, deletedAt: null },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const config = { ...DEFAULTS };
  for (const field of Object.keys(FIELD_TO_KEY) as (keyof PlatformConfig)[]) {
    const raw = byKey.get(FIELD_TO_KEY[field]);
    if (raw !== undefined) {
      const parsed = parseFloat(raw);
      if (!Number.isNaN(parsed)) config[field] = parsed;
    }
  }
  return config;
}

/** Upserts the provided settings and returns the resulting full config. */
export async function updatePlatformConfig(
  input: UpdatePlatformConfigInput,
): Promise<PlatformConfig> {
  const writes = (Object.keys(input) as (keyof PlatformConfig)[])
    .filter((field) => input[field] !== undefined)
    .map((field) => {
      const key = FIELD_TO_KEY[field];
      const value = String(input[field]);
      return prisma.appSettings.upsert({
        where: { key },
        create: { key, value },
        update: { value, deletedAt: null },
      });
    });

  await prisma.$transaction(writes);
  return getPlatformConfig();
}
