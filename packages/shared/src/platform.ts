// ──────────────────────────────────────────────────────────────
// Platform-wide constants
// ──────────────────────────────────────────────────────────────

/**
 * The single market NannyApp operates in. Every booking wall-clock time —
 * what a parent picks, the daily booking window, the admin's booking editor —
 * is expressed in this zone. The database stores true UTC; this is the zone
 * everything is converted to for display and back from for storage.
 *
 * IANA name (not a fixed offset) because Egypt observes DST: the offset moves
 * between +02:00 and +03:00.
 *
 * This module must stay dependency-free — mobile imports it, and the timezone
 * database lives only on the backend (see `platform-time.ts`).
 */
export const PLATFORM_TIMEZONE = 'Africa/Cairo';

/**
 * `instant`'s calendar date in `PLATFORM_TIMEZONE`, as a `Date` whose *local*
 * year/month/day are Cairo's — for code that reads `Date`'s local getters
 * (`getFullYear`/`getMonth`/`getDate`) and needs Cairo's "today" rather than
 * the caller's own, such as the registration age check: a UTC server crosses
 * into Cairo's next day 2-3 hours before its own midnight (Cairo runs
 * UTC+2/+3 with DST), and `new Date()` alone would refuse someone turning 18
 * today for those hours.
 *
 * Uses `Intl.DateTimeFormat` rather than a timezone-database package (compare
 * `platform-time.ts`, backend-only, which needs real DST arithmetic for
 * booking times) — a calendar date needs no arithmetic, just formatting, and
 * every JS engine this app ships on (Node; Hermes since it began bundling
 * full ICU) resolves `Africa/Cairo` correctly.
 */
export function platformToday(instant: Date = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: PLATFORM_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const part = (type: 'year' | 'month' | 'day'): number =>
      Number(parts.find((p) => p.type === type)?.value);
    const today = new Date(part('year'), part('month') - 1, part('day'));
    if (!Number.isNaN(today.getTime())) return today;
  } catch {
    // An engine without time-zone support falls through to its own calendar
    // date — at worst a few hours off at midnight, never a crash on the
    // registration screen that calls this.
  }
  return new Date(instant.getFullYear(), instant.getMonth(), instant.getDate());
}
