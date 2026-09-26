import React from 'react';
import { RefreshControl } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@mobile/components/NotificationBellButton', () => () => null);

import { unwrapPaginated } from '@mobile/lib/api';
import CommunityFeedScreen from '@mobile/screens/parent/CommunityFeedScreen';

const mockUnwrapPaginated = unwrapPaginated as jest.Mock;

function emptyPage() {
  return { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommunityFeedScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUnwrapPaginated.mockResolvedValue(emptyPage());
});

describe('CommunityFeedScreen', () => {
  it('explains an empty feed rather than showing nothing', async () => {
    const { findByText } = renderScreen();
    expect(await findByText('No posts in this category yet.')).toBeTruthy();
  });

  it('asks the server again when pulled down', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('No posts in this category yet.');
    const before = mockUnwrapPaginated.mock.calls.length;

    const control = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      await control.props.onRefresh();
    });

    await waitFor(() => expect(mockUnwrapPaginated.mock.calls.length).toBeGreaterThan(before));
  });
});
