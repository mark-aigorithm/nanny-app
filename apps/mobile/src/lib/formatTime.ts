export function formatTimeUtc(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

export function formatTimeRangeUtc(startIso: string, endIso: string): string {
  return `${formatTimeUtc(startIso)} - ${formatTimeUtc(endIso)}`;
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

/** Formats an "HH:mm" string as a 12h label. */
export function formatHhMm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((v) => parseInt(v ?? '0', 10));
  return formatHour24(h, m);
}
