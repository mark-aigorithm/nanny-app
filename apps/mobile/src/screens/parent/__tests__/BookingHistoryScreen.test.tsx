import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@mobile/components/OngoingBookingBanner', () => () => null);

import { unwrap } from '@mobile/lib/api';
import BookingHistoryScreen from '@mobile/screens/parent/BookingHistoryScreen';

const mockUnwrap = unwrap as jest.Mock;

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingHistoryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnwrap.mockResolvedValue([]);
});

describe('BookingHistoryScreen', () => {
  it('explains an empty tab rather than showing a blank list', async () => {
    const { findByText, getByText } = renderScreen();

    expect(await findByText('No upcoming bookings')).toBeTruthy();

    fireEvent.press(getByText('Past'));
    expect(await findByText('No past bookings')).toBeTruthy();

    fireEvent.press(getByText('Cancelled'));
    expect(await findByText('No cancelled bookings')).toBeTruthy();
  });

  it('asks the server again when pulled down', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('No upcoming bookings');
    const before = mockUnwrap.mock.calls.length;

    const control = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      await control.props.onRefresh();
    });

    await waitFor(() => expect(mockUnwrap.mock.calls.length).toBeGreaterThan(before));
  });
});
