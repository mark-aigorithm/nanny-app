import {
  addHoursToWallClock,
  BOOKING_EXTENSION_PRESET_HOURS,
  extendablePresetHours,
} from '@nanny-app/shared';

/** Wall-clock builder — keeps the intent of each case readable. */
const at = (dateIso: string, hour: number, minute = 0): string =>
  `${dateIso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

const D = '2026-07-20';
const NEXT = '2026-07-21';

describe('addHoursToWallClock', () => {
  it('adds whole hours within a day', () => {
    expect(addHoursToWallClock(at(D, 14), 3)).toBe(at(D, 17));
  });

  it('preserves the minutes of a non-hour-aligned time', () => {
    expect(addHoursToWallClock(at(D, 14, 30), 2)).toBe(at(D, 16, 30));
  });

  it('rolls over midnight onto the next date', () => {
    expect(addHoursToWallClock(at(D, 23), 2)).toBe(at(NEXT, 1));
  });

  it('rolls back over midnight onto the previous date', () => {
    expect(addHoursToWallClock(at(NEXT, 1), -2)).toBe(at(D, 23));
  });

  it('crosses a month boundary', () => {
    expect(addHoursToWallClock('2026-07-31T22:00:00', 3)).toBe('2026-08-01T01:00:00');
  });

  it('fails closed on malformed input', () => {
    expect(addHoursToWallClock('not-a-time', 1)).toBeNull();
    expect(addHoursToWallClock('2026-13-01T00:00:00', 1)).toBeNull();
  });
});

// The rule the Extend sheet depends on: a preset is only offered when the
// LONGER booking still satisfies everything createBooking would demand of it.
describe('extendablePresetHours — daily window (8 → 22)', () => {
  const presets = (endHour: number, durationHours: number, maxBookingHours = 12) =>
    extendablePresetHours({
      startWall: at(D, 10),
      endWall: at(D, endHour),
      durationHours,
      windowStartHour: 8,
      windowEndHour: 22,
      maxBookingHours,
    });

  it('offers every preset in the middle of the window', () => {
    expect(presets(14, 4)).toEqual([1, 2, 3]);
  });

  it('drops presets that would run past the window close', () => {
    // Ends 20:00; +1 → 21:00 and +2 → 22:00 both fit, +3 → 23:00 does not.
    expect(presets(20, 10)).toEqual([1, 2]);
  });

  it('offers nothing once the booking already ends at the window close', () => {
    expect(presets(22, 12)).toEqual([]);
  });

  it('caps on max duration before the window becomes the binding limit', () => {
    // 14:00 end leaves room in the window, but a 10h booking may only grow 2h.
    expect(presets(14, 10)).toEqual([1, 2]);
  });

  it('offers nothing when the booking is already at the max duration', () => {
    expect(presets(14, 12)).toEqual([]);
  });

  it('never offers an hour amount outside the presets', () => {
    for (const h of presets(14, 4)) {
      expect(BOOKING_EXTENSION_PRESET_HOURS).toContain(h);
    }
  });
});

describe('extendablePresetHours — window across midnight (18 → 4)', () => {
  const presets = (startWall: string, endWall: string) =>
    extendablePresetHours({
      startWall,
      endWall,
      durationHours: 4,
      windowStartHour: 18,
      windowEndHour: 4,
      maxBookingHours: 12,
    });

  it('extends an overnight booking up to the window close', () => {
    // 20:00 → 00:00, window shuts at 04:00, so 1-3 extra hours all fit.
    expect(presets(at(D, 20), at(NEXT, 0))).toEqual([1, 2, 3]);
  });

  it('stops at the window close on the far side of midnight', () => {
    // Ends 02:00; +1 → 03:00 and +2 → 04:00 fit, +3 → 05:00 is past close.
    expect(presets(at(D, 22), at(NEXT, 2))).toEqual([1, 2]);
  });
});

describe('extendablePresetHours — 24-hour window restricts nothing', () => {
  it('is bounded only by the max duration', () => {
    expect(
      extendablePresetHours({
        startWall: at(D, 10),
        endWall: at(D, 22),
        durationHours: 12,
        windowStartHour: 0,
        windowEndHour: 0,
        maxBookingHours: 14,
      }),
    ).toEqual([1, 2]);
  });
});
