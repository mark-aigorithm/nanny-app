import {
  addDaysIso,
  generateCareDaySlots,
  isBookingWithinDailyWindow,
  type BookingOptions,
  type CareDaySlot,
} from '@nanny-app/shared';

/** Start times are offered every 5 minutes — the stepper walks one notch at a time. */
export const START_STEP_MINUTES = 5;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Shifts a wall-clock string by whole minutes, rolling the date over midnight.
 *
 * Pure calendar arithmetic on the string — never `new Date`, which would parse
 * it in the DEVICE's timezone and land an hour out on a DST boundary. The
 * server does the timezone conversion; the client only ever moves wall time.
 */
export function addMinutesToWall(wall: string, minutes: number): string {
  const dateIso = wall.slice(0, 10);
  const total = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16)) + minutes;
  const dayShift = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  return `${addDaysIso(dateIso, dayShift)}T${pad2(Math.floor(rem / 60))}:${pad2(rem % 60)}:00`;
}

/** Replaces the time-of-day on a wall-clock string, keeping its date. */
function withTimeOfDay(wall: string, hour: number, minute: number): string {
  return `${wall.slice(0, 10)}T${pad2(hour)}:${pad2(minute)}:00`;
}

/**
 * A slot can be offered only once the minimum advance notice has passed. Both
 * sides are fixed-width platform wall-clock, so comparing the strings compares
 * the times — no timezone maths on the device, and no reliance on its clock.
 */
export function isStartBookable(startWall: string, options: BookingOptions): boolean {
  return startWall >= options.earliestStartWallClock;
}

/** The hours care may start on a care-day — the coarse grid the chips are built from. */
export function careDaySlots(dateIso: string, options: BookingOptions): CareDaySlot[] {
  return generateCareDaySlots(
    dateIso,
    options.bookingWindowStartHour,
    options.bookingWindowEndHour,
    options.minBookingHours,
  );
}

/**
 * Every start time on offer for a care-day, at minute granularity and in
 * chronological order.
 *
 * Candidates are filtered with the same functions the server validates with, so
 * the picker can't offer a start the API would reject.
 */
export function startCandidatesForDay(dateIso: string, options: BookingOptions): string[] {
  const out: string[] = [];
  for (const slot of careDaySlots(dateIso, options)) {
    for (let minute = 0; minute < 60; minute += START_STEP_MINUTES) {
      const candidate = withTimeOfDay(slot.startWall, slot.hour, minute);
      if (!isStartBookable(candidate, options)) continue;
      if (
        !isBookingWithinDailyWindow(
          candidate,
          addMinutesToWall(candidate, options.minBookingHours * 60),
          options.bookingWindowStartHour,
          options.bookingWindowEndHour,
        )
      ) {
        continue;
      }
      out.push(candidate);
    }
  }
  return out;
}

/**
 * Whether a care-day has any start left to offer — asked of the very list the
 * picker would offer, so a day is shown exactly when it has something on it.
 *
 * Deliberately NOT "is any whole hour still bookable": with a full-day care
 * window the last hour offered is 22:00, so from 22:00 onwards no boundary
 * qualifies while 22:45, 22:50 and 22:55 are all still legal — a booking may
 * cross midnight when care runs around the clock. That mismatch hid *today*
 * for the last two hours of every night.
 */
export function isDayBookable(dateIso: string, options: BookingOptions): boolean {
  return startCandidatesForDay(dateIso, options).length > 0;
}
