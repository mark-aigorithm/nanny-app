import { useEffect, useMemo, useState } from 'react';
import type { BookingResponse } from '@nanny-app/shared';

/** "2h 15m" / "8m" until the given instant, for the pre-reveal countdown. */
export function formatCountdown(msLeft: number): string {
  const totalMinutes = Math.max(0, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * The nanny's phone number, as far as the mother may see it right now.
 *
 * For privacy the backend withholds the number until nannyPhoneRevealMinutes
 * before the start time (through the end of the shift). Before that window
 * `upcoming` is true and `unlockMs` says when it opens; inside it `active` is
 * true and the number arrives on the booking — pulled with `onRefresh` every
 * ~15s until it does, which also covers small clock skew. startTime/endTime
 * are offset-bearing ISO strings, so parsing them yields the correct instant.
 */
export function useNannyPhone(booking: BookingResponse, onRefresh?: () => void) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the window edge and the countdown stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { active, upcoming, unlockMs } = useMemo(() => {
    const startMs = new Date(booking.startTime).getTime();
    const endMs = new Date(booking.endTime).getTime();
    const unlock = startMs - booking.nannyPhoneRevealMinutes * 60_000;
    const canReveal =
      !!booking.nanny && (booking.status === 'CONFIRMED' || booking.status === 'IN_PROGRESS');
    return {
      active: canReveal && now >= unlock && now <= endMs,
      upcoming: canReveal && booking.status === 'CONFIRMED' && now < unlock,
      unlockMs: unlock,
    };
  }, [
    booking.nanny,
    booking.status,
    booking.startTime,
    booking.endTime,
    booking.nannyPhoneRevealMinutes,
    now,
  ]);

  const phone = active ? (booking.nanny?.phone ?? null) : null;

  const refetchBucket = active && !phone ? Math.floor(now / 15_000) : null;
  useEffect(() => {
    if (refetchBucket !== null) onRefresh?.();
  }, [refetchBucket, onRefresh]);

  return {
    phone,
    /** Inside the reveal window — the number is shown, or is on its way. */
    active,
    /** Confirmed, and the window has not opened yet. */
    upcoming,
    /** Until the window opens; only meaningful while `upcoming`. */
    msUntilUnlock: unlockMs - now,
  };
}
