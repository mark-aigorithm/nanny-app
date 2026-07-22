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
