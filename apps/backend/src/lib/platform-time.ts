import { PLATFORM_TIMEZONE, WALL_CLOCK_REGEX } from '@nanny-app/shared';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

import { errors } from '@backend/lib/errors';

/**
 * Conversion between the platform's wall-clock times and the true UTC instants
 * stored in the database.
 *
 * The contract, in one line: clients send and receive WALL-CLOCK, the database
 * holds UTC, and this module is the only place the two meet. Keeping the
 * timezone database on the backend is deliberate — mobile does no timezone math
 * at all, so it can't disagree with the server and doesn't depend on the
 * device's ICU build.
 */

const WALL_CLOCK_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/**
 * Interprets a wall-clock string ("2026-07-20T09:00:00") as a time in
 * PLATFORM_TIMEZONE and returns the UTC instant it denotes.
 *
 * Rejects wall-clock times that don't exist. Egypt springs forward 00:00 → 01:00,
 * so on that one night a time like "00:30" never happens — `fromZonedTime` would
 * silently slide it to 01:30 and the parent would be booked an hour off without
 * being told. Round-tripping the result catches that and turns it into a 400.
 */
export function assertWallClock(value: string, field = 'Time'): void {
  if (!WALL_CLOCK_REGEX.test(value)) {
    throw errors.badRequest(
      `${field} must be a wall-clock value (YYYY-MM-DDTHH:mm:ss) with no timezone offset.`,
    );
  }
}

export function wallClockToUtc(wall: string): Date {
  // Checked here as well as at the route's Zod layer: a caller reaching this
  // with an offset ("…Z", "…+02:00") means the wrong contract, and without this
  // it would trip the DST guard below and get a baffling error about daylight
  // saving instead of being told its input shape is wrong.
  assertWallClock(wall);
  const instant = fromZonedTime(wall, PLATFORM_TIMEZONE);
  if (Number.isNaN(instant.getTime())) {
    throw errors.badRequest('Invalid date/time.');
  }
  if (formatInTimeZone(instant, PLATFORM_TIMEZONE, WALL_CLOCK_FORMAT) !== wall) {
    throw errors.badRequest(
      'That time does not exist on the selected date (daylight saving change). Pick another time.',
    );
  }
  return instant;
}

/** "2026-07-20T09:00:00+03:00" — the instant as platform wall-clock plus its offset. */
export function toPlatformIso(instant: Date): string {
  return formatInTimeZone(instant, PLATFORM_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** "2026-07-20" — the platform calendar date the instant falls on. */
export function toPlatformDateIso(instant: Date): string {
  return formatInTimeZone(instant, PLATFORM_TIMEZONE, 'yyyy-MM-dd');
}

/** "2026-07-20T09:00:00" — the instant as platform wall-clock, no offset. */
export function toPlatformWallClock(instant: Date): string {
  return formatInTimeZone(instant, PLATFORM_TIMEZONE, WALL_CLOCK_FORMAT);
}

/** The platform wall-clock hour (0-23) the instant falls on. */
export function platformHour(instant: Date): number {
  return toZonedTime(instant, PLATFORM_TIMEZONE).getHours();
}

/**
 * A `@db.Date` value for the platform calendar date an instant falls on.
 * Postgres DATE columns round-trip through Prisma as midnight UTC.
 */
export function toPlatformDateColumn(instant: Date): Date {
  return new Date(`${toPlatformDateIso(instant)}T00:00:00Z`);
}
