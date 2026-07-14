import type { PlatformConfig, UpdatePlatformConfigInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';

const KEYS = {
  SERVICE_FEE_PERCENT: 'service_fee_percent',
  STANDARD_HOURLY_RATE: 'standard_hourly_rate',
  NANNY_PERCENT: 'nanny_percent',
  PLATFORM_PERCENT: 'platform_percent',
  MAX_BOOKING_HOURS: 'max_booking_hours',
  MIN_BOOKING_HOURS: 'min_booking_hours',
  MIN_ADVANCE_BOOKING_HOURS: 'min_advance_booking_hours',
  CANCELLATION_WINDOW_HOURS: 'cancellation_window_hours',
  BROADCAST_RADIUS_KM: 'broadcast_radius_km',
  PENDING_WARNING_MINUTES: 'pending_warning_minutes',
  PENDING_CRITICAL_MINUTES: 'pending_critical_minutes',
} as const;

const DEFAULTS: PlatformConfig = {
  serviceFeePercent: 6,
  standardHourlyRate: 120,
  nannyPercent: 80,
  platformPercent: 20,
  maxBookingHours: 12,
  minBookingHours: 2,
  minAdvanceBookingHours: 2,
  cancellationWindowHours: 24,
  broadcastRadiusKm: 10,
  pendingWarningMinutes: 15,
  pendingCriticalMinutes: 30,
};

/** Maps each PlatformConfig field to its app_settings key. */
const FIELD_TO_KEY: Record<keyof PlatformConfig, string> = {
  serviceFeePercent: KEYS.SERVICE_FEE_PERCENT,
  standardHourlyRate: KEYS.STANDARD_HOURLY_RATE,
  nannyPercent: KEYS.NANNY_PERCENT,
  platformPercent: KEYS.PLATFORM_PERCENT,
  maxBookingHours: KEYS.MAX_BOOKING_HOURS,
  minBookingHours: KEYS.MIN_BOOKING_HOURS,
  minAdvanceBookingHours: KEYS.MIN_ADVANCE_BOOKING_HOURS,
  cancellationWindowHours: KEYS.CANCELLATION_WINDOW_HOURS,
  broadcastRadiusKm: KEYS.BROADCAST_RADIUS_KM,
  pendingWarningMinutes: KEYS.PENDING_WARNING_MINUTES,
  pendingCriticalMinutes: KEYS.PENDING_CRITICAL_MINUTES,
};

/** Returns the platform service fee % from app_settings (default 6 if not seeded). */
export async function getServiceFeePercent(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.SERVICE_FEE_PERCENT },
  });
  return row ? parseFloat(row.value) : DEFAULTS.serviceFeePercent;
}

/**
 * Returns the fixed platform hourly rate from app_settings (default if not
 * seeded). Every booking is priced against this rate rather than a per-nanny
 * rate, so the mother knows the total before any nanny claims the request.
 */
export async function getStandardHourlyRate(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.STANDARD_HOURLY_RATE },
  });
  return row ? parseFloat(row.value) : DEFAULTS.standardHourlyRate;
}

/**
 * Returns the nanny/platform revenue split (percentages that sum to 100). This
 * replaces the legacy service fee as the source of truth for who-gets-what.
 */
export async function getRevenueSplit(): Promise<{ nannyPercent: number; platformPercent: number }> {
  const rows = await prisma.appSettings.findMany({
    where: { key: { in: [KEYS.NANNY_PERCENT, KEYS.PLATFORM_PERCENT] }, deletedAt: null },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const parse = (key: string, fallback: number): number => {
    const raw = byKey.get(key);
    if (raw === undefined) return fallback;
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? fallback : parsed;
  };
  return {
    nannyPercent: parse(KEYS.NANNY_PERCENT, DEFAULTS.nannyPercent),
    platformPercent: parse(KEYS.PLATFORM_PERCENT, DEFAULTS.platformPercent),
  };
}

/**
 * Radius (km) for broadcasting new booking requests to nearby nannies.
 * 0 means no distance filter — every eligible nanny is notified.
 */
export async function getBroadcastRadiusKm(): Promise<number> {
  const row = await prisma.appSettings.findUnique({
    where: { key: KEYS.BROADCAST_RADIUS_KM },
  });
  if (!row) return DEFAULTS.broadcastRadiusKm;
  const parsed = parseFloat(row.value);
  return Number.isNaN(parsed) ? DEFAULTS.broadcastRadiusKm : parsed;
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
