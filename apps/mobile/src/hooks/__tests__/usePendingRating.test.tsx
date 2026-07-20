import React from 'react';
import type { BookingResponse, UserResponse } from '@nanny-app/shared';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// `usePendingRating.ts` imports `api` from `@mobile/lib/api`, which in turn
// imports `@mobile/lib/firebase` — a module that eagerly initializes the real
// Firebase JS SDK at import time. Stub the API layer so these tests stay
// fast and side-effect-free; `unwrap` keeps its real "unwrap the envelope"
// shape so hook-level tests exercise realistic success responses.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

import { api } from '@mobile/lib/api';
import { pickPendingRating, usePendingRating, PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
import { markRatingResolved, useRatingPromptStore } from '@mobile/store/ratingPromptStore';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import type { FirebaseUser } from '@mobile/lib/firebase';

function makeBooking(over: Partial<BookingResponse>): BookingResponse {
  return { id: 0, status: 'COMPLETED', myReview: null, ...over } as BookingResponse;
}

describe('pickPendingRating', () => {
  it('returns null for an empty list', () => {
    expect(pickPendingRating([])).toBeNull();
  });

  it('returns the completed booking when it has no review', () => {
    const b = makeBooking({ id: 1 });
    expect(pickPendingRating([b])?.id).toBe(1);
  });

  it('returns null when the most recent completed booking is already reviewed', () => {
    const b = makeBooking({ id: 2, myReview: { id: 10, rating: 5, comment: null, createdAt: 'now' } });
    expect(pickPendingRating([b])).toBeNull();
  });

  it('ignores bookings the user already resolved this session', () => {
    const b = makeBooking({ id: 3 });
    markRatingResolved(3);
    expect(pickPendingRating([b])).toBeNull();
  });

  it('only considers the first (most recent) item', () => {
    const reviewed = makeBooking({ id: 4, myReview: { id: 11, rating: 4, comment: null, createdAt: 'now' } });
    const unrated = makeBooking({ id: 5 });
    // API returns newest-first; older unrated bookings must NOT force-prompt.
    expect(pickPendingRating([reviewed, unrated])).toBeNull();
  });
});

const mockGet = api.get as jest.Mock;
const fakeUser = { uid: 'user_1' } as unknown as FirebaseUser;

function fakeProfile(role: 'MOTHER' | 'NANNY'): UserResponse {
  return { role } as unknown as UserResponse;
}

// Tracks the currently-mounted renderHook result so afterEach can unmount it
// before resetting store state. Without this, the previous test's hook stays
// subscribed to the Zustand stores and useQuery, so (a) resetStores' setState
// calls fire outside of act() and warn, and (b) the AppState listener + React
// Query's internal GC timer never get torn down, which keeps Jest's process
// alive well past test completion.
let currentUnmount: (() => void) | null = null;

function resetStores(): void {
  useRatingPromptStore.setState({ booking: null });
  useAuthStore.setState({ user: null });
  useUserProfileStore.setState({ profile: null });
  mockGet.mockReset();
}

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    // retry: false keeps failed-query tests fast and deterministic.
    // gcTime: 0 drops query state (and its cleanup timer) the instant the
    // hook unmounts, instead of lingering for the default 5 minutes.
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(() => usePendingRating(), { wrapper: Wrapper });
  currentUnmount = result.unmount;
  return { ...result, queryClient };
}

describe('usePendingRating (hook behavior)', () => {
  beforeEach(resetStores);
  afterEach(() => {
    currentUnmount?.();
    currentUnmount = null;
    resetStores();
  });

  it('does not fetch or prompt for a non-mother (auth/role gate)', async () => {
    useAuthStore.setState({ user: fakeUser });
    useUserProfileStore.setState({ profile: fakeProfile('NANNY') });

    renderWithQueryClient();

    expect(mockGet).not.toHaveBeenCalled();
    expect(useRatingPromptStore.getState().booking).toBeNull();
  });

  it('shows the prompt for a mother with an unrated completed booking', async () => {
    useAuthStore.setState({ user: fakeUser });
    useUserProfileStore.setState({ profile: fakeProfile('MOTHER') });
    const booking = makeBooking({ id: 6 });
    mockGet.mockResolvedValueOnce({ data: { data: [booking], error: null } });

    renderWithQueryClient();

    await waitFor(() => {
      expect(useRatingPromptStore.getState().booking?.id).toBe(6);
    });
  });

  it('does not override an already-showing prompt', async () => {
    const alreadyShowing = makeBooking({ id: 7 });
    useRatingPromptStore.setState({ booking: alreadyShowing });
    useAuthStore.setState({ user: fakeUser });
    useUserProfileStore.setState({ profile: fakeProfile('MOTHER') });
    const otherPending = makeBooking({ id: 8 });
    mockGet.mockResolvedValueOnce({ data: { data: [otherPending], error: null } });

    const { queryClient } = renderWithQueryClient();

    // Wait for the query to actually resolve with the new data before asserting
    // the store was left untouched — otherwise the assertion could pass simply
    // because the effect hadn't run yet.
    await waitFor(() => {
      expect(queryClient.getQueryData(PENDING_RATING_KEY)).toEqual([otherPending]);
    });

    expect(useRatingPromptStore.getState().booking?.id).toBe(7);
  });
});
