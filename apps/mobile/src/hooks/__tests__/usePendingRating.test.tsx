import type { BookingResponse } from '@nanny-app/shared';

// `usePendingRating.ts` imports `api` from `@mobile/lib/api`, which in turn
// imports `@mobile/lib/firebase` — a module that eagerly initializes the real
// Firebase JS SDK at import time. This test only exercises the pure
// `pickPendingRating` predicate, so stub the API layer to keep this a fast,
// side-effect-free unit test.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn(),
}));

import { pickPendingRating } from '@mobile/hooks/usePendingRating';
import { markRatingResolved } from '@mobile/store/ratingPromptStore';

function makeBooking(over: Partial<BookingResponse>): BookingResponse {
  return { id: 'bk', status: 'COMPLETED', myReview: null, ...over } as BookingResponse;
}

describe('pickPendingRating', () => {
  it('returns null for an empty list', () => {
    expect(pickPendingRating([])).toBeNull();
  });

  it('returns the completed booking when it has no review', () => {
    const b = makeBooking({ id: 'bk_1' });
    expect(pickPendingRating([b])?.id).toBe('bk_1');
  });

  it('returns null when the most recent completed booking is already reviewed', () => {
    const b = makeBooking({ id: 'bk_2', myReview: { id: 'r', rating: 5, comment: null, createdAt: 'now' } });
    expect(pickPendingRating([b])).toBeNull();
  });

  it('ignores bookings the user already resolved this session', () => {
    const b = makeBooking({ id: 'bk_3' });
    markRatingResolved('bk_3');
    expect(pickPendingRating([b])).toBeNull();
  });

  it('only considers the first (most recent) item', () => {
    const reviewed = makeBooking({ id: 'newest', myReview: { id: 'r', rating: 4, comment: null, createdAt: 'now' } });
    const unrated = makeBooking({ id: 'older' });
    // API returns newest-first; older unrated bookings must NOT force-prompt.
    expect(pickPendingRating([reviewed, unrated])).toBeNull();
  });
});
