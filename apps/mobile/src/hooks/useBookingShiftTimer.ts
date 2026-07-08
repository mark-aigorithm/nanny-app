import { useEffect, useMemo, useState } from 'react';
import type { BookingResponse } from '@nanny-app/shared';
import { CHECK_IN_EARLY_MINUTES } from '@nanny-app/shared';

import { showShiftWindowPrompt } from '@mobile/store/nannyShiftPromptStore';
export type ShiftPhase =
  | 'idle'
  | 'upcoming'
  | 'starting_soon'
  | 'ready_to_start'
  | 'overdue'
  | 'in_progress';

export interface ShiftTimerState {
  nearestBooking: BookingResponse | null;
  phase: ShiftPhase;
  countdownLabel: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

const STARTING_SOON_MS = 60 * 60_000;

function sortByStartTime(bookings: BookingResponse[]): BookingResponse[] {  return [...bookings].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

function pickNearestBooking(bookings: BookingResponse[]): BookingResponse | null {
  const sorted = sortByStartTime(bookings);
  const inProgress = sorted.find((b) => b.status === 'IN_PROGRESS');
  if (inProgress) return inProgress;
  return sorted.find((b) => b.status === 'CONFIRMED') ?? null;
}

function computePhase(booking: BookingResponse | null, now: number): ShiftPhase {
  if (!booking) return 'idle';
  if (booking.status === 'IN_PROGRESS') return 'in_progress';

  const startMs = new Date(booking.startTime).getTime();
  const endMs = new Date(booking.endTime).getTime();
  const earliestCheckIn = startMs - CHECK_IN_EARLY_MINUTES * 60_000;

  if (now > endMs) return 'overdue';
  if (now >= startMs && now <= endMs) return 'overdue';
  if (now >= earliestCheckIn) return 'ready_to_start';
  if (startMs - now <= STARTING_SOON_MS) return 'starting_soon';
  return 'upcoming';
}

function formatCountdown(booking: BookingResponse, phase: ShiftPhase, now: number): string {
  const startMs = new Date(booking.startTime).getTime();
  const endMs = new Date(booking.endTime).getTime();

  if (phase === 'in_progress') {
    const checkedInAt = booking.nannyCheckedInAt
      ? new Date(booking.nannyCheckedInAt).getTime()
      : now;
    const mins = Math.floor((now - checkedInAt) / 60_000);
    if (mins < 1) return 'Just started';
    if (mins < 60) return `${mins} min in`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem === 0 ? `${hrs}h in` : `${hrs}h ${rem}m in`;
  }

  if (phase === 'overdue') {
    const overdueMins = Math.floor((now - startMs) / 60_000);
    if (overdueMins < 1) return 'Start now';
    return `Overdue by ${overdueMins} min`;
  }

  if (phase === 'ready_to_start') return 'Start now';

  const diffMs = startMs - now;
  const mins = Math.ceil(diffMs / 60_000);
  if (mins < 60) return `Starts in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `Starts in ${hrs}h` : `Starts in ${hrs}h ${rem}m`;
}

function maybeShowShiftPrompt(booking: BookingResponse, phase: ShiftPhase): void {
  if (phase === 'ready_to_start') {
    showShiftWindowPrompt(booking, 'ready');
    return;
  }
  if (phase === 'overdue') {
    showShiftWindowPrompt(booking, 'overdue');
  }
}
export function useBookingShiftTimer(bookings: BookingResponse[]): ShiftTimerState {
  const [now, setNow] = useState(() => Date.now());

  const nearestBooking = useMemo(() => pickNearestBooking(bookings), [bookings]);

  const phase = useMemo(
    () => computePhase(nearestBooking, now),
    [nearestBooking, now],
  );

  const countdownLabel = useMemo(() => {
    if (!nearestBooking) return '';
    return formatCountdown(nearestBooking, phase, now);
  }, [nearestBooking, phase, now]);

  const canCheckIn = useMemo(() => {
    if (!nearestBooking || nearestBooking.status !== 'CONFIRMED') return false;
    const startMs = new Date(nearestBooking.startTime).getTime();
    const endMs = new Date(nearestBooking.endTime).getTime();
    const earliestCheckIn = startMs - CHECK_IN_EARLY_MINUTES * 60_000;
    return now >= earliestCheckIn && now <= endMs;
  }, [nearestBooking, now]);

  const canCheckOut = nearestBooking?.status === 'IN_PROGRESS';

  useEffect(() => {
    const needsFastTick =
      phase === 'starting_soon' ||
      phase === 'ready_to_start' ||
      phase === 'overdue' ||
      phase === 'in_progress';

    const intervalMs = needsFastTick ? 1_000 : 30_000;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (nearestBooking && (phase === 'ready_to_start' || phase === 'overdue')) {
      maybeShowShiftPrompt(nearestBooking, phase);
    }
  }, [nearestBooking, phase]);

  return {
    nearestBooking,
    phase,
    countdownLabel,
    canCheckIn: Boolean(canCheckIn),
    canCheckOut: Boolean(canCheckOut),
  };
}

export function sortBookingsByStartTime(bookings: BookingResponse[]): BookingResponse[] {
  return sortByStartTime(bookings);
}
