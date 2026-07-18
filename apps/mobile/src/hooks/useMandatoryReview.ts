import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@shared/auth';

import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { useBookingList } from '@mobile/hooks/useBookings';

/**
 * The mother's first completed-but-unrated booking, if any — the signal that
 * drives the mandatory-review gate.
 *
 * A booking reaches COMPLETED when the nanny checks out; `myReview` stays null
 * until the mother rates it, so `status === 'COMPLETED' && myReview == null`
 * is an owed rating. Only runs for a signed-in mother: guests have no JWT (the
 * `/bookings` call would 401) and nannies never rate.
 */
export function useUnratedCompletedBooking(): {
  booking: BookingResponse | undefined;
  isLoading: boolean;
} {
  const user = useAuthStore((s) => s.user);
  const profile = useUserProfileStore((s) => s.profile);
  const isMother = !!user && profile?.role === Role.MOTHER;

  const query = useBookingList('COMPLETED', undefined, undefined, isMother);
  const booking = query.data?.find((b) => b.myReview == null);

  return { booking, isLoading: query.isLoading };
}
