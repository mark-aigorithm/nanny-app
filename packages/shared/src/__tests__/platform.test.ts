/**
 * `platformToday` backs the registration age check's default "today" (see
 * `auth.ts`) — it must read Cairo's calendar date, not whatever zone the
 * caller's own clock happens to be in, since a UTC backend crosses into
 * Cairo's next day 2-3 hours before its own midnight.
 */
import { describe, expect, it } from 'vitest';

import { PLATFORM_TIMEZONE, platformToday } from '../platform';

describe('platformToday', () => {
  it('names Cairo as the platform timezone', () => {
    expect(PLATFORM_TIMEZONE).toBe('Africa/Cairo');
  });

  it('reads Cairo’s calendar date even when the instant is still "today" in UTC', () => {
    // Cairo runs UTC+2 outside DST — 23:00 UTC on New Year's Eve is already
    // 01:00 on New Year's Day in Cairo, a date `new Date()`'s own UTC or a
    // Western local-time getter would not show for another hour.
    const utcInstant = new Date('2025-12-31T23:00:00Z');
    const today = platformToday(utcInstant);
    expect([today.getFullYear(), today.getMonth(), today.getDate()]).toEqual([2026, 0, 1]);
  });

  it('reads Cairo’s summer (DST) offset too', () => {
    // Cairo observes DST (UTC+3) in summer — 21:30 UTC is already 00:30 the
    // next day in Cairo, one hour earlier than the winter case above.
    const utcInstant = new Date('2026-07-14T21:30:00Z');
    const today = platformToday(utcInstant);
    expect([today.getFullYear(), today.getMonth(), today.getDate()]).toEqual([2026, 6, 15]);
  });

  it('defaults to the real current instant when none is given', () => {
    const before = platformToday();
    expect(before.getFullYear()).toBeGreaterThanOrEqual(2024);
  });
});
