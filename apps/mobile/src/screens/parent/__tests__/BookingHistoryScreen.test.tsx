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
// Stands in for the banner's own query, so a pull can be seen reaching it.
jest.mock('@mobile/components/OngoingBookingBanner', () => () => {
  require('@mobile/hooks/useBookings').useBookingList('IN_PROGRESS');
  return null;
});

import { api, unwrap } from '@mobile/lib/api';
import BookingHistoryScreen from '@mobile/screens/parent/BookingHistoryScreen';

const mockUnwrap = unwrap as jest.Mock;
const mockGet = api.get as jest.Mock;

function fetchesOf(status: string) {
  return mockGet.mock.calls.filter(([, config]) => config?.params?.status === status).length;
}

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

  it('asks the server again for the list and the ongoing-visit banner when pulled down', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('No upcoming bookings');
    await waitFor(() => expect(fetchesOf('IN_PROGRESS')).toBe(1));
    const upcoming = 'PENDING,APPROVED,PENDING_CONFIRMATION,CONFIRMED,IN_PROGRESS';
    expect(fetchesOf(upcoming)).toBe(1);

    const control = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      await control.props.onRefresh();
    });

    expect(fetchesOf(upcoming)).toBe(2);
    expect(fetchesOf('IN_PROGRESS')).toBe(2);
    expect(control.props.refreshing).toBe(false);
  });
});
