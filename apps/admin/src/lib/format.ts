import { PLATFORM_TIMEZONE } from '@nanny-app/shared';

/**
 * Format an API timestamp for display, always in the platform's timezone.
 *
 * Pinned to PLATFORM_TIMEZONE rather than the browser's: an admin working from
 * another timezone must still read the times the parents and nannies see, or
 * they'd reschedule a booking to the wrong hour.
 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: PLATFORM_TIMEZONE,
  });
}

/**
 * A booking's time window on one line, in the platform's timezone:
 * "Sat, 26 Sept 2026 · 14:00 – 17:00". An overnight booking spells out the end
 * day too, so it never reads as ending before it starts.
 */
export function formatTimeRange(startIso: string, endIso: string): string {
  const day = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: PLATFORM_TIMEZONE,
    });
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { timeStyle: 'short', timeZone: PLATFORM_TIMEZONE });
  const startDay = day(startIso);
  const endDay = day(endIso);
  return startDay === endDay
    ? `${startDay} · ${time(startIso)} – ${time(endIso)}`
    : `${startDay} · ${time(startIso)} – ${endDay} · ${time(endIso)}`;
}

/**
 * Booking `startTime`/`endTime` → a value for <input type="datetime-local">.
 *
 * The API sends platform wall-clock plus its offset, and the input wants bare
 * wall-clock, so this is a slice — no Date, no timezone conversion. Going
 * through a Date would re-interpret the time in the browser's zone.
 */
export function toDateTimeLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

/** <input type="datetime-local"> value → the wall-clock the API expects. */
export function fromDateTimeLocalInput(value: string): string {
  return `${value}:00`;
}

/** Format an EGP amount for the admin UI, e.g. 410.4 → "EGP 410.40". */
export function formatEgp(amount: number): string {
  return `EGP ${amount.toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact currency without the code, e.g. 410.4 → "410.40". */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Fractional hours read cleanly — whole numbers show with no decimal noise. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
}

/**
 * A stored UTC instant → "YYYY-MM-DDTHH:mm" for <input type="datetime-local">,
 * read in the platform's timezone. The reverse trip is
 * `fromDateTimeLocalInput`, which adds seconds and leaves the zone to the
 * backend.
 */
export function toPlatformDateTimeInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLATFORM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Up to two initials for an avatar fallback, e.g. "Nanny Test" → "NT". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}
