import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BookingResponse } from '@nanny-app/shared';

const mockMutate = jest.fn();
jest.mock('@mobile/hooks/useNannies', () => ({
  useCreateReview: () => ({ mutate: mockMutate, isPending: false }),
}));

jest.mock('@mobile/lib/api', () => ({
  getApiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { useRatingPromptStore } from '@mobile/store/ratingPromptStore';

const booking = {
  id: 1,
  status: 'COMPLETED',
  myReview: null,
  nanny: { nannyProfileId: 1, firstName: 'Amina', lastName: 'K', avatarUrl: null, location: null },
} as unknown as BookingResponse;

// RatingPromptSheet calls useQueryClient() directly (to invalidate the pending-
// rating query on resolve), so it needs a QueryClientProvider ancestor even
// though these tests never touch server state directly.
function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RatingPromptSheet />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockMutate.mockReset();
  useRatingPromptStore.setState({ booking: null });
});

describe('RatingPromptSheet', () => {
  it('renders nothing when no booking is pending', () => {
    const { toJSON } = renderSheet();
    expect(toJSON()).toBeNull();
  });

  it('shows the nanny name when a booking is pending', () => {
    useRatingPromptStore.setState({ booking });
    const { getByText } = renderSheet();
    expect(getByText(/Amina/)).toBeTruthy();
  });

  it('disables submit until a star is chosen, then submits the rating', () => {
    useRatingPromptStore.setState({ booking });
    const { getByText, getAllByLabelText } = renderSheet();

    fireEvent.press(getByText('Submit rating'));
    expect(mockMutate).not.toHaveBeenCalled();

    fireEvent.press(getAllByLabelText(/Rate 5 stars/)[0]);
    fireEvent.press(getByText('Submit rating'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 5 }),
      expect.any(Object),
    );
  });

  it('treats an "already reviewed" 409 as success and closes', async () => {
    useRatingPromptStore.setState({ booking });
    mockMutate.mockImplementation((_body: unknown, opts: { onError: (err: Error) => void }) =>
      opts.onError(new Error('You have already reviewed this booking.')),
    );
    const { getByText, getAllByLabelText } = renderSheet();
    fireEvent.press(getAllByLabelText(/Rate 4 stars/)[0]);
    fireEvent.press(getByText('Submit rating'));
    await waitFor(() => expect(useRatingPromptStore.getState().booking).toBeNull());
  });
});
