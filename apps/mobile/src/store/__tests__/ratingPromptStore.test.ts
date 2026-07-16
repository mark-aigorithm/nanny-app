import type { BookingResponse } from '@nanny-app/shared';
import {
  useRatingPromptStore,
  markRatingResolved,
  isRatingResolved,
} from '@mobile/store/ratingPromptStore';

const booking = { id: 'bk_1' } as BookingResponse;

beforeEach(() => {
  useRatingPromptStore.setState({ booking: null });
});

describe('ratingPromptStore', () => {
  it('starts with no booking', () => {
    expect(useRatingPromptStore.getState().booking).toBeNull();
  });

  it('showRatingPrompt sets the booking', () => {
    useRatingPromptStore.getState().showRatingPrompt(booking);
    expect(useRatingPromptStore.getState().booking?.id).toBe('bk_1');
  });

  it('clearRatingPrompt resets the booking', () => {
    useRatingPromptStore.getState().showRatingPrompt(booking);
    useRatingPromptStore.getState().clearRatingPrompt();
    expect(useRatingPromptStore.getState().booking).toBeNull();
  });

  it('tracks resolved bookings', () => {
    expect(isRatingResolved('bk_2')).toBe(false);
    markRatingResolved('bk_2');
    expect(isRatingResolved('bk_2')).toBe(true);
  });
});
