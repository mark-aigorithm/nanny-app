import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommunityPostResponse } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK at
// module-load time and crashes jest-expo's transform. Stub the API layer.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { unwrapPaginated } from '@mobile/lib/api';
import MyListingsScreen from '@mobile/screens/parent/MyListingsScreen';

const mockUnwrapPaginated = unwrapPaginated as jest.Mock;

function makeListing(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
  return {
    id: 44,
    type: 'marketplace',
    title: 'Stroller',
    body: 'Barely used',
    imageUrls: [],
    price: 1200,
    location: null,
    eventStartsAt: null,
    maxAttendees: null,
    rsvpCount: 0,
    tags: [],
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    rsvpdByMe: false,
    moderationStatus: 'approved',
    rejectionReason: null,
    isOfficial: false,
    contactPhone: null,
    author: { id: 29, firstName: 'Jane', lastName: 'Doe', avatarUrl: null },
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

function mockListings(listings: CommunityPostResponse[]) {
  mockUnwrapPaginated.mockResolvedValue({
    items: listings,
    meta: { page: 1, limit: 20, total: listings.length, totalPages: 1 },
  });
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyListingsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MyListingsScreen', () => {
  it('shows the rejection reason and an edit-and-resubmit action', async () => {
    mockListings([
      makeListing({
        moderationStatus: 'rejected',
        rejectionReason: 'Photos are too blurry',
      }),
    ]);

    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Needs changes')).toBeTruthy());
    expect(getByText('Photos are too blurry')).toBeTruthy();

    fireEvent.press(getByText('Edit & resubmit'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(parent)/create-post',
        params: expect.objectContaining({ postId: '44', returnTo: 'my-listings' }),
      }),
    );
  });

  it('marks a listing awaiting review and offers no resubmit copy', async () => {
    mockListings([makeListing({ moderationStatus: 'pending' })]);

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Under review')).toBeTruthy());
    expect(getByText('Edit listing')).toBeTruthy();
    expect(queryByText('Edit & resubmit')).toBeNull();
  });

  it('shows a live listing without an edit prompt', async () => {
    mockListings([makeListing()]);

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Live')).toBeTruthy());
    expect(queryByText('Edit listing')).toBeNull();
  });

  it('explains the empty state', async () => {
    mockListings([]);

    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Nothing listed yet')).toBeTruthy());
  });
});
