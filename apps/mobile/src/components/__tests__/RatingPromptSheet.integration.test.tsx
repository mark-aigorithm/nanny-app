import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import type { BookingResponse } from '@nanny-app/shared';

// `@mobile/lib/api` imports `auth` from `@mobile/lib/firebase`, which eagerly
// initializes the real Firebase JS SDK at module-load time and crashes
// jest-expo's transform. Stub exactly the surface `api.ts` uses — `auth()`
// is only ever called as `auth().currentUser` in the request interceptor —
// so the REAL `api`, `unwrap`, and `getApiErrorMessage` all load and run
// unmocked. This is what makes this file an integration test: unlike
// RatingPromptSheet.test.tsx (which mocks `@mobile/hooks/useNannies` and
// `@mobile/lib/api` directly), this test exercises the real
// axios → unwrap → getApiErrorMessage pipeline end to end.
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({ currentUser: null }),
}));

import { api } from '@mobile/lib/api';
import RatingPromptSheet from '@mobile/components/RatingPromptSheet';
import { useRatingPromptStore } from '@mobile/store/ratingPromptStore';

const booking = {
  id: 1,
  status: 'COMPLETED',
  myReview: null,
  nanny: { nannyProfileId: 1, firstName: 'Amina', lastName: 'K', avatarUrl: null, location: null },
} as unknown as BookingResponse;

function renderSheet() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RatingPromptSheet />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useRatingPromptStore.setState({ booking: null });
  jest.restoreAllMocks();
});

describe('RatingPromptSheet (real API pipeline integration)', () => {
  it('treats a real axios 409 "already reviewed" response as success and closes, via the unmocked unwrap/getApiErrorMessage pipeline', async () => {
    useRatingPromptStore.setState({ booking });

    // Build a real AxiosError the way axios itself would construct one for a
    // 409 response, so this exercises getApiErrorMessage's actual 409 branch
    // (server message, not the technical/network fallbacks) rather than a
    // hand-rolled Error like the mocked unit test uses.
    const response = {
      status: 409,
      data: { data: null, error: 'You have already reviewed this booking.' },
    } as unknown as AxiosResponse;
    const axiosErr = new AxiosError(
      'Request failed with status code 409',
      undefined,
      undefined,
      undefined,
      response,
    );
    jest.spyOn(api, 'post').mockRejectedValueOnce(axiosErr);

    const { getByText, getAllByLabelText } = renderSheet();

    fireEvent.press(getAllByLabelText(/Rate 5 stars/)[0]);
    fireEvent.press(getByText('Submit rating'));

    // If getApiErrorMessage's 409 branch ever regressed to a generic fallback
    // instead of surfacing the server's "already reviewed" text, the
    // component's isAlreadyReviewed() substring match would fail, the sheet
    // would show an error instead of closing, and — because it is
    // non-dismissible — the parent would be stuck with no way out.
    await waitFor(() => expect(useRatingPromptStore.getState().booking).toBeNull());
  });
});
