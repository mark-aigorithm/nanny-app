import React from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
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
// Stands in for the banners' own queries, so a pull can be seen reaching them.
jest.mock('@mobile/components/OngoingBookingBanner', () => () => {
  require('@mobile/hooks/useBookings').useBookingList('IN_PROGRESS');
  return null;
});
jest.mock('@mobile/components/NannyExtensionRequestCard', () => () => null);
jest.mock('@mobile/components/UpcomingShiftBanner', () => ({
  __esModule: true,
  default: () => null,
  confirmStartShift: jest.fn(),
  confirmEndShift: jest.fn(),
}));
jest.mock('@mobile/components/NannyBottomNav', () => () => null);
jest.mock('@mobile/components/NannyTabHeader', () => () => null);

import { api, unwrap } from '@mobile/lib/api';
import { HEADER_HEIGHT } from '@mobile/theme';
import NannyRequestsScreen from '@mobile/screens/nanny/NannyRequestsScreen';

const mockUnwrap = unwrap as jest.Mock;
const mockGet = api.get as jest.Mock;

function fetchesOf(url: string, status?: string) {
  return mockGet.mock.calls.filter(
    ([path, config]) => path === url && config?.params?.status === status,
  ).length;
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NannyRequestsScreen />
    </QueryClientProvider>,
  );
}

async function pull(control: { props: { onRefresh: () => Promise<void> } }) {
  await act(async () => {
    await control.props.onRefresh();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnwrap.mockResolvedValue([]);
});

describe('NannyRequestsScreen', () => {
  it('starts the list below the header, where the pull spinner can be seen', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('No open requests right now');

    // iOS draws the spinner at the list's top edge — under the solid header it
    // was hidden — and Android draws it there too once there is no offset.
    const list = UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(list.props.style).marginTop).toBe(HEADER_HEIGHT);
    expect(list.props.refreshControl.props.progressViewOffset).toBeUndefined();
  });

  it('asks the server again for the open requests and the ongoing-visit banner when pulled down', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('No open requests right now');
    await waitFor(() => expect(fetchesOf('/bookings', 'IN_PROGRESS')).toBe(1));
    expect(fetchesOf('/bookings/available')).toBe(1);

    const control = UNSAFE_getByType(RefreshControl);
    await pull(control);

    expect(fetchesOf('/bookings/available')).toBe(2);
    expect(fetchesOf('/bookings', 'IN_PROGRESS')).toBe(2);
    expect(control.props.refreshing).toBe(false);
  });

  it('refreshes the list under the chip that is showing', async () => {
    const { findByText, getByText, UNSAFE_getByType } = renderScreen();
    await findByText('No open requests right now');

    fireEvent.press(getByText('Past'));
    expect(await findByText('No past bookings')).toBeTruthy();
    expect(fetchesOf('/bookings', 'COMPLETED')).toBe(1);

    await pull(UNSAFE_getByType(RefreshControl));

    expect(fetchesOf('/bookings', 'COMPLETED')).toBe(2);
  });
});
