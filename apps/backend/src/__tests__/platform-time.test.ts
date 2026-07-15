import { AppError } from '@backend/lib/errors';
import {
  platformHour,
  toPlatformDateColumn,
  toPlatformDateIso,
  toPlatformIso,
  toPlatformWallClock,
  wallClockToUtc,
} from '@backend/lib/platform-time';

/**
 * Africa/Cairo observes DST, so the offset moves between +02:00 (winter) and
 * +03:00 (summer). The 2026 transitions, verified against the IANA database:
 *   spring forward  2026-04-24  00:00 → 01:00  (00:00-00:59 never happens)
 *   fall back       2026-10-29  24:00 → 23:00  (23:00-23:59 happens twice)
 */

describe('wallClockToUtc', () => {
  it('reads a summer wall-clock as +03:00', () => {
    expect(wallClockToUtc('2026-07-20T09:00:00').toISOString()).toBe('2026-07-20T06:00:00.000Z');
  });

  it('reads a winter wall-clock as +02:00', () => {
    expect(wallClockToUtc('2026-01-20T09:00:00').toISOString()).toBe('2026-01-20T07:00:00.000Z');
  });

  it('rejects a wall-clock time that does not exist (spring forward)', () => {
    // The clock jumps 00:00 → 01:00, so 00:30 is not a real time that night.
    expect(() => wallClockToUtc('2026-04-24T00:30:00')).toThrow(AppError);
    expect(() => wallClockToUtc('2026-04-24T00:30:00')).toThrow(/daylight saving/i);
  });

  it('accepts the hour either side of the spring-forward gap', () => {
    expect(wallClockToUtc('2026-04-23T23:30:00').toISOString()).toBe('2026-04-23T21:30:00.000Z');
    expect(wallClockToUtc('2026-04-24T01:30:00').toISOString()).toBe('2026-04-23T22:30:00.000Z');
  });

  it('resolves an ambiguous fall-back wall-clock to the later instant', () => {
    // 23:30 happens twice on 2026-10-29 (once at +03:00, again at +02:00).
    // date-fns-tz picks the second. Either is defensible and the time genuinely
    // exists, so it's accepted rather than rejected — we just pin which one.
    expect(wallClockToUtc('2026-10-29T23:30:00').toISOString()).toBe('2026-10-29T21:30:00.000Z');
  });

  it('rejects a malformed wall-clock', () => {
    expect(() => wallClockToUtc('not-a-time')).toThrow(AppError);
  });
});

describe('toPlatformIso', () => {
  it('renders a summer instant with the +03:00 offset', () => {
    expect(toPlatformIso(new Date('2026-07-20T06:00:00Z'))).toBe('2026-07-20T09:00:00+03:00');
  });

  it('renders a winter instant with the +02:00 offset', () => {
    expect(toPlatformIso(new Date('2026-01-20T07:00:00Z'))).toBe('2026-01-20T09:00:00+02:00');
  });

  it('round-trips with wallClockToUtc', () => {
    const iso = toPlatformIso(wallClockToUtc('2026-07-20T09:00:00'));
    expect(iso.slice(0, 19)).toBe('2026-07-20T09:00:00');
  });
});

describe('toPlatformDateIso', () => {
  it('uses the platform calendar day, not the UTC one', () => {
    // 22:30Z in July is 01:30 the NEXT day in Cairo.
    expect(toPlatformDateIso(new Date('2026-07-20T22:30:00Z'))).toBe('2026-07-21');
  });

  it('agrees with UTC when the day does not straddle', () => {
    expect(toPlatformDateIso(new Date('2026-07-20T06:00:00Z'))).toBe('2026-07-20');
  });
});

describe('toPlatformWallClock', () => {
  it('drops the offset', () => {
    expect(toPlatformWallClock(new Date('2026-07-20T06:00:00Z'))).toBe('2026-07-20T09:00:00');
  });
});

describe('platformHour', () => {
  it('returns the Cairo hour, not the UTC hour', () => {
    expect(platformHour(new Date('2026-07-20T22:30:00Z'))).toBe(1);
    expect(platformHour(new Date('2026-07-20T06:00:00Z'))).toBe(9);
  });
});

describe('toPlatformDateColumn', () => {
  it('returns midnight UTC of the platform date, as @db.Date expects', () => {
    expect(toPlatformDateColumn(new Date('2026-07-20T22:30:00Z')).toISOString()).toBe(
      '2026-07-21T00:00:00.000Z',
    );
  });
});
