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
import MyPostsScreen from '@mobile/screens/parent/MyPostsScreen';

const mockUnwrapPaginated = unwrapPaginated as jest.Mock;

function makePost(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
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

function mockPosts(posts: CommunityPostResponse[]) {
  mockUnwrapPaginated.mockResolvedValue({
    items: posts,
    meta: { page: 1, limit: 20, total: posts.length, totalPages: 1 },
  });
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MyPostsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MyPostsScreen', () => {
  it('shows the rejection reason and an edit-and-resubmit action', async () => {
    mockPosts([
      makePost({
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
        params: expect.objectContaining({ postId: '44', returnTo: 'my-posts' }),
      }),
    );
  });

  it('labels each type and shows an event’s date and place', async () => {
    mockPosts([
      makePost({
        id: 45,
        type: 'event',
        title: 'Coffee morning',
        location: 'Maadi',
        eventStartsAt: '2026-10-01T09:00:00.000Z',
        price: null,
        moderationStatus: 'pending',
      }),
      makePost({
        id: 46,
        type: 'qa',
        title: null,
        body: 'Where do I buy a pram?',
        price: null,
        moderationStatus: 'pending',
      }),
    ]);

    const { getByText, getAllByText } = renderScreen();

    await waitFor(() => expect(getByText('Coffee morning')).toBeTruthy());
    expect(getByText('Event')).toBeTruthy();
    expect(getByText(/Maadi/)).toBeTruthy();
    expect(getByText('Q&A')).toBeTruthy();
    expect(getByText('Where do I buy a pram?')).toBeTruthy();
    expect(getAllByText('Under review')).toHaveLength(2);
    expect(getAllByText('Edit post')).toHaveLength(2);
  });

  it('keeps the listing wording for a pending listing', async () => {
    mockPosts([makePost({ moderationStatus: 'pending' })]);

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Under review')).toBeTruthy());
    expect(getByText('Edit listing')).toBeTruthy();
    expect(queryByText('Edit & resubmit')).toBeNull();
  });

  it('opens a live post in the feed it belongs to', async () => {
    mockPosts([makePost({ id: 45, type: 'event', title: 'Coffee morning', price: null })]);

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Live')).toBeTruthy());
    expect(queryByText('Edit post')).toBeNull();

    fireEvent.press(getByText('Coffee morning'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(parent)/post-detail',
        params: expect.objectContaining({ postId: '45', filter: 'Events' }),
      }),
    );
  });

  it('explains the empty state', async () => {
    mockPosts([]);

    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Nothing posted yet')).toBeTruthy());
  });
});
