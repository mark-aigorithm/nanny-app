import {
  isTimeRangeWithinDaySchedule,
  doesDurationFitDaySchedule,
  getDayScheduleWindowMinutes,
  BOOKING_OUTSIDE_AVAILABILITY_MESSAGE,
} from '@nanny-app/shared';
import type { WeeklySchedule } from '@nanny-app/shared';

/** Minutes-from-midnight helper for readable test intent. */
const at = (hour: number, minute = 0): number => hour * 60 + minute;

// Mon (1): 09:00–17:00, Tue (2): unavailable, Wed (3): 09:00–17:30 (minute bound).
const schedule: WeeklySchedule = {
  '1': { available: true, startTime: '09:00', endTime: '17:00' },
  '2': { available: false, startTime: '00:00', endTime: '00:00' },
  '3': { available: true, startTime: '09:00', endTime: '17:30' },
};

describe('isTimeRangeWithinDaySchedule', () => {
  it('accepts a range fully inside the window', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 1, at(10), at(14))).toBe(true);
  });

  it('accepts a range starting exactly on the window start (edge)', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 1, at(9), at(11))).toBe(true);
  });

  it('accepts a range ending exactly on the window end (edge)', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 1, at(13), at(17))).toBe(true);
  });

  it('rejects a range whose end overshoots the window end', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 1, at(15), at(18))).toBe(false);
  });

  it('rejects a range whose start is before the window start', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 1, at(8), at(12))).toBe(false);
  });

  it('rejects when the day is explicitly unavailable', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 2, at(10), at(12))).toBe(false);
  });

  it('rejects when the day key is missing entirely', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 0, at(10), at(12))).toBe(false);
  });

  it('honours minute-level window bounds (09:00–17:30)', () => {
    expect(isTimeRangeWithinDaySchedule(schedule, 3, at(13), at(17))).toBe(true); // ends 17:00
    expect(isTimeRangeWithinDaySchedule(schedule, 3, at(13), at(17, 30))).toBe(true); // ends exactly 17:30 (edge)
    expect(isTimeRangeWithinDaySchedule(schedule, 3, at(14), at(18))).toBe(false); // ends 18:00
  });

  it('rejects for a null or undefined schedule', () => {
    expect(isTimeRangeWithinDaySchedule(null, 1, at(10), at(12))).toBe(false);
    expect(isTimeRangeWithinDaySchedule(undefined, 1, at(10), at(12))).toBe(false);
  });

  it('exposes a human-readable out-of-window message', () => {
    expect(BOOKING_OUTSIDE_AVAILABILITY_MESSAGE).toMatch(/available hours/i);
  });
});

describe('doesDurationFitDaySchedule', () => {
  it('true when start + duration stays within the window', () => {
    expect(doesDurationFitDaySchedule(schedule, 1, at(13), 4)).toBe(true); // 13:00–17:00 (edge)
  });

  it('false when start + duration overshoots the window', () => {
    expect(doesDurationFitDaySchedule(schedule, 1, at(16), 2)).toBe(false); // 16:00–18:00
  });

  it('false on an unavailable day', () => {
    expect(doesDurationFitDaySchedule(schedule, 2, at(10), 2)).toBe(false);
  });
});

describe('getDayScheduleWindowMinutes', () => {
  it('returns the window length in minutes (honouring minute bounds)', () => {
    expect(getDayScheduleWindowMinutes(schedule, 1)).toBe(8 * 60);
    expect(getDayScheduleWindowMinutes(schedule, 3)).toBe(8 * 60 + 30);
  });

  it('returns null for unavailable, missing, or absent schedule', () => {
    expect(getDayScheduleWindowMinutes(schedule, 2)).toBeNull();
    expect(getDayScheduleWindowMinutes(schedule, 0)).toBeNull();
    expect(getDayScheduleWindowMinutes(null, 1)).toBeNull();
  });
});
