import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, toPlatformDateTimeInput } from '@admin/lib/format';

describe('toPlatformDateTimeInput', () => {
  it('shows a stored UTC instant as Cairo wall-clock for a datetime-local input', () => {
    // Cairo is UTC+2 in January.
    expect(toPlatformDateTimeInput('2026-01-15T09:00:00.000Z')).toBe('2026-01-15T11:00');
    // Crossing midnight moves the date too.
    expect(toPlatformDateTimeInput('2026-01-15T23:30:00.000Z')).toBe('2026-01-16T01:30');
  });
});

describe('formatDate / formatDateTime', () => {
  it('use one medium style in the platform timezone, never seconds', () => {
    // 23:30 UTC is already the next day in Cairo.
    expect(formatDate('2026-01-15T23:30:00.000Z')).toBe('16 Jan 2026');
    expect(formatDateTime('2026-01-15T09:00:00.000Z')).toBe('15 Jan 2026, 11:00');
  });
});
