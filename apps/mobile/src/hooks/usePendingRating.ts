import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { api, unwrap } from '@mobile/lib/api';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import {
  useRatingPromptStore,
  isRatingResolved,
} from '@mobile/store/ratingPromptStore';

export const PENDING_RATING_KEY = ['pending-rating'] as const;

/**
 * The single booking that should force a rating: the most-recently completed
 * booking, if it is unrated and not already resolved this session. Older unrated
 * bookings never force-prompt — they stay optionally rateable from history.
 */
export function pickPendingRating(bookings: BookingResponse[]): BookingResponse | null {
  const mostRecent = bookings[0];
  if (!mostRecent) return null;
  if (mostRecent.status !== 'COMPLETED') return null;
  if (mostRecent.myReview) return null;
  if (isRatingResolved(mostRecent.id)) return null;
  return mostRecent;
}

function usePendingRatingQuery() {
  const firebaseUser = useAuthStore((s) => s.user);
  const role = useUserProfileStore((s) => s.profile?.role);
  const enabled = !!firebaseUser && role === Role.MOTHER;
  const query = useQuery<BookingResponse[]>({
    queryKey: PENDING_RATING_KEY,
    enabled,
    queryFn: () =>
      unwrap(
        api.get('/bookings', {
          params: { status: 'COMPLETED', sortBy: 'date', sortDir: 'desc', limit: 1 },
        }),
      ),
  });
  return { enabled, query };
}

/**
 * True once detection has answered or failed (or never runs for her). The
 * survey prompt waits for this, so it never opens just before a rating sheet
 * that takes its place in the same commit. React Query shares the request.
 */
export function usePendingRatingSettled(): boolean {
  const { enabled, query } = usePendingRatingQuery();
  return !enabled || query.isFetched || query.isError;
}

/**
 * Detects an unrated completed booking and drives the mandatory rating prompt.
 * Runs only for authenticated mothers. Re-checks when the app returns to the
 * foreground so a booking completed while backgrounded surfaces on next open.
 */
export function usePendingRating(): void {
  const showRatingPrompt = useRatingPromptStore((s) => s.showRatingPrompt);
  const storeBooking = useRatingPromptStore((s) => s.booking);
  const queryClient = useQueryClient();
  const {
    enabled,
    query: { data },
  } = usePendingRatingQuery();

  // Refetch on foreground so a completion that happened while backgrounded shows.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
      }
    });
    return () => sub.remove();
  }, [enabled, queryClient]);

  // Feed the store whenever detection finds a pending rating and none is showing.
  useEffect(() => {
    if (!enabled || !data || storeBooking) return;
    const pending = pickPendingRating(data);
    if (pending) showRatingPrompt(pending);
  }, [enabled, data, storeBooking, showRatingPrompt]);
}
