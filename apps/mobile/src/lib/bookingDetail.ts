import type { BookingChild } from '@nanny-app/shared';

import { formatDurationHours } from '@mobile/lib/formatTime';

/**
 * Pure helpers behind the parent's Booking details screen. Kept out of the
 * components so the arithmetic — where "now" sits on the shift, what the
 * screen calls the day — is testable without mounting anything.
 */

export interface ShiftProgress {
  /** Where now sits between the booked start and end, clamped to 0–1. */
  fraction: number;
  /** Until the booked end. Negative once the shift has run past it. */
  msLeft: number;
  /** Since the nanny checked in (or the booked start, if that is unknown). */
  msElapsed: number;
  /** Care-log moments as fractions along the same strip, oldest first. */
  ticks: number[];
}

export function shiftProgress(input: {
  startTime: string;
  endTime: string;
  checkedInAt: string | null;
  moments: readonly string[];
  now: number;
}): ShiftProgress {
  const start = new Date(input.startTime).getTime();
  const end = new Date(input.endTime).getTime();
  const span = Math.max(end - start, 1);
  const at = (ms: number) => Math.min(Math.max((ms - start) / span, 0), 1);
  const began = input.checkedInAt ? new Date(input.checkedInAt).getTime() : start;

  return {
    fraction: at(input.now),
    msLeft: end - input.now,
    msElapsed: Math.max(input.now - began, 0),
    ticks: input.moments.map((iso) => at(new Date(iso).getTime())).sort((a, b) => a - b),
  };
}

/** "2h 55m", "45m" — whole minutes, never seconds. */
export function formatSpan(ms: number): string {
  return formatDurationHours(Math.floor(Math.max(ms, 0) / 60_000) / 60);
}

/** The big line on the live card: how long is left, or that she is over. */
export function timeLeftLabel(msLeft: number): string {
  if (msLeft < 0) return 'Past the booked end time';
  if (msLeft < 60_000) return 'Ending now';
  return `${formatSpan(msLeft)} left`;
}

export function elapsedLabel(msElapsed: number): string {
  return msElapsed < 60_000 ? 'Just started' : `Started ${formatSpan(msElapsed)} ago`;
}

/**
 * "Laila and Omar", "Laila, Omar and Sara" — or a count when any child on the
 * booking has no name, so a half-named list never reads as the whole family.
 */
export function childrenPhrase(children: readonly BookingChild[], childrenCount: number): string {
  const names = children.map((c) => c.name?.trim()).filter((n): n is string => !!n);
  if (names.length > 0 && names.length === children.length) {
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  const count = children.length || childrenCount;
  return count === 1 ? 'your child' : `${count} children`;
}

/**
 * The header's subtitle: "Today, Monday 28 September". `isoDate` is the
 * booking's wall-clock date ("2026-09-28"), so it is formatted in UTC to keep
 * the device's timezone from moving it a day.
 */
export function bookingDayLabel(isoDate: string, now: Date = new Date()): string {
  const day = new Date(`${isoDate}T00:00:00Z`);
  const label = day.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((day.getTime() - today) / 86_400_000);
  if (diffDays === 0) return `Today, ${label}`;
  if (diffDays === 1) return `Tomorrow, ${label}`;
  if (diffDays === -1) return `Yesterday, ${label}`;
  return label;
}

/**
 * "4 hours" for a whole-hour booking — the wording the e2e flows read — and
 * "4h 30m" for the half-hour lengths the picker also offers.
 */
export function durationLabel(hours: number): string {
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return formatDurationHours(hours);
}

/** "EH" for Elena Hassan — the avatar fallback when she has no photo. */
export function nannyInitials(nanny: { firstName: string; lastName: string }): string {
  return `${nanny.firstName.trim().charAt(0)}${nanny.lastName.trim().charAt(0)}`.toUpperCase();
}
