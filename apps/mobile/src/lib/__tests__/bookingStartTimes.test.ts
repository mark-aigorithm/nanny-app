import type { BookingOptions } from '@nanny-app/shared';
import { isDayBookable, startCandidatesForDay } from '@mobile/lib/bookingStartTimes';

/**
 * Care around the clock with no lead time — `start === end` is the schema's
 * documented full-day case, and it is what the mobile lab runs on. With no
 * window to run past, what is bookable is decided purely by the clock.
 */
function options(overrides: Partial<BookingOptions> = {}): BookingOptions {
  return {
    bookingWindowStartHour: 0,
    bookingWindowEndHour: 0,
    minBookingHours: 2,
    maxBookingHours: 12,
    minAdvanceBookingHours: 0,
    timezone: 'Africa/Cairo',
    nowWallClock: '2026-08-21T22:45:00',
    earliestStartWallClock: '2026-08-21T22:45:00',
    ...overrides,
  };
}

describe('bookable days — full-day care window', () => {
  it('still offers today at 22:45, when only part-hour starts are left', () => {
    expect(isDayBookable('2026-08-21', options())).toBe(true);
  });

  it('offers every five-minute start left in the day, first one first', () => {
    // Hour boundaries have all passed; these three have not, and a booking may
    // cross midnight when care runs around the clock.
    expect(startCandidatesForDay('2026-08-21', options())).toEqual([
      '2026-08-21T22:45:00',
      '2026-08-21T22:50:00',
      '2026-08-21T22:55:00',
    ]);
  });

  it('drops a day once even its last minute has passed', () => {
    const late = options({ earliestStartWallClock: '2026-08-21T23:05:00' });
    expect(isDayBookable('2026-08-21', late)).toBe(false);
    expect(startCandidatesForDay('2026-08-21', late)).toEqual([]);
  });
});

describe('bookable days — 06:00–22:00 care window', () => {
  const daytime = { bookingWindowStartHour: 6, bookingWindowEndHour: 22 };

  it('offers a start that still ends before the window closes', () => {
    const o = options({ ...daytime, earliestStartWallClock: '2026-08-21T19:40:00' });
    expect(isDayBookable('2026-08-21', o)).toBe(true);
    expect(startCandidatesForDay('2026-08-21', o)[0]).toBe('2026-08-21T19:40:00');
  });

  it('drops the day when the shortest booking would run past the close', () => {
    // 21:30 + the 2-hour minimum lands at 23:30, past 22:00 — nothing is left.
    const o = options({ ...daytime, earliestStartWallClock: '2026-08-21T21:30:00' });
    expect(isDayBookable('2026-08-21', o)).toBe(false);
  });
});
