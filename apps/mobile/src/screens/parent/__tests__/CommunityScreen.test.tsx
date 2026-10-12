import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn(),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();
let mockParams: { filter?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, setParams: mockSetParams, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { api, unwrapPaginated } from '@mobile/lib/api';
import CommunityScreen from '@mobile/screens/parent/CommunityScreen';

const mockGet = api.get as jest.Mock;
const mockUnwrapPaginated = unwrapPaginated as jest.Mock;

function emptyPage() {
  return { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommunityScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockUnwrapPaginated.mockResolvedValue(emptyPage());
});

describe('CommunityScreen', () => {
  it('shows every post type by default', async () => {
    const { findByText } = renderScreen();
    expect(await findByText('Nothing here yet')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/community/posts', {
      params: { page: 1, limit: 20 },
    });
  });

  // The bug a tester hit: Services → Events opened Q&A, because the filter
  // was local state that a second visit didn't reset.
  it('opens on the filter the link names', async () => {
    mockParams = { filter: 'Events' };
    const { findByText, getByText } = renderScreen();
    expect(await findByText('No upcoming events')).toBeTruthy();
    expect(getByText('Host')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/community/posts', {
      params: { page: 1, limit: 20, type: 'event' },
    });
  });

  it('switches filter through the route, so the link and the pills agree', async () => {
    const { findByText, getByText } = renderScreen();
    await findByText('Nothing here yet');
    fireEvent.press(getByText('Marketplace'));
    expect(mockSetParams).toHaveBeenCalledWith({ filter: 'Marketplace' });
  });

  it('opens the composer on the type being browsed', async () => {
    mockParams = { filter: 'Marketplace' };
    const { findByText, getByLabelText } = renderScreen();
    await findByText('No listings yet');
    fireEvent.press(getByLabelText('Create post'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/create-post',
      params: { type: 'marketplace' },
    });
  });

  it('leads to My posts', async () => {
    const { findByText, getByText } = renderScreen();
    await findByText('Nothing here yet');
    fireEvent.press(getByText('My posts'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/my-posts');
  });

  it('asks the server again when pulled down', async () => {
    const { findByText, UNSAFE_getByType } = renderScreen();
    await findByText('Nothing here yet');
    const before = mockUnwrapPaginated.mock.calls.length;

    const control = UNSAFE_getByType(RefreshControl);
    await act(async () => {
      await control.props.onRefresh();
    });

    await waitFor(() => expect(mockUnwrapPaginated.mock.calls.length).toBeGreaterThan(before));
  });
});
