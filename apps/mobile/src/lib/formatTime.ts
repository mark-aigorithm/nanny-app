/**
 * Formats a booking time from the API, e.g. "2026-07-20T09:00:00+03:00" → "9:00 AM".
 *
 * The API sends booking times as platform wall-clock plus their offset, so the
 * hours and minutes in the string are already the time the parent picked. We
 * read them straight off it rather than parsing to a Date and formatting: that
 * would need a timezone database on the device, and React Native's JS engine
 * can't be relied on to ship one.
 *
 * Only for `startTime`/`endTime`. Other API timestamps (createdAt, checked-in
 * at, …) are plain UTC instants with no wall-clock meaning — format those from
 * a Date.
 */
export function formatBookingTime(iso: string): string {
  return formatHhMm(iso.slice(11, 16));
}

export function formatBookingTimeRange(startIso: string, endIso: string): string {
  return `${formatBookingTime(startIso)} - ${formatBookingTime(endIso)}`;
}

/** Formats a 24h clock hour (0–23) as a 12h label, e.g. 13 → "1:00 PM". */
export function formatHour24(hour: number, minute = 0): string {
  return new Date(Date.UTC(1970, 0, 1, hour, minute)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

/** @deprecated Alias kept for hot-reload safety — use formatHour24 */
export const formatHourLabel = formatHour24;

/**
 * Formats a possibly-fractional hour count as "4h" / "4h 30m" / "45m".
 *
 * Bookings are no longer whole hours — the picker offers half-hour lengths and
 * any start minute — so "4.5 hours" must never reach the screen.
 */
export function formatDurationHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Formats an "HH:mm" string as a 12h label. */
export function formatHhMm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v ?? '0', 10));
  return formatHour24(h, m);
}
