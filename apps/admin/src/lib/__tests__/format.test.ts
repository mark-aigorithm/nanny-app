import { describe, expect, it } from 'vitest';

import { toPlatformDateTimeInput } from '@admin/lib/format';

describe('toPlatformDateTimeInput', () => {
  it('shows a stored UTC instant as Cairo wall-clock for a datetime-local input', () => {
    // Cairo is UTC+2 in January.
    expect(toPlatformDateTimeInput('2026-01-15T09:00:00.000Z')).toBe('2026-01-15T11:00');
    // Crossing midnight moves the date too.
    expect(toPlatformDateTimeInput('2026-01-15T23:30:00.000Z')).toBe('2026-01-16T01:30');
  });
});
