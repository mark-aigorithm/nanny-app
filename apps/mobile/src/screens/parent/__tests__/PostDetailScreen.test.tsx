import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommunityPostResponse } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK at
// module-load time and crashes jest-expo's transform. Stub the API layer.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  unwrap: jest.fn(),
  unwrapPaginated: jest.fn().mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ postId: '44' }),
}));

import { unwrap } from '@mobile/lib/api';
import PostDetailScreen from '@mobile/screens/parent/PostDetailScreen';

const mockUnwrap = unwrap as jest.Mock;

function makeListing(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
  return {
    id: 44,
    type: 'marketplace',
    title: 'Convertible car seat',
    body: null,
    imageUrls: [],
    price: 3500,
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

function renderScreen(post: CommunityPostResponse) {
  mockUnwrap.mockResolvedValue(post);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PostDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('PostDetailScreen — marketplace CTA', () => {
  it('opens WhatsApp on the listing’s number for an official listing', async () => {
    const { getByText, queryByText } = renderScreen(
      makeListing({ isOfficial: true, contactPhone: '+201001234567' }),
    );

    await waitFor(() => expect(getByText('Contact NannyNow')).toBeTruthy());
    // No seller inbox exists for a platform listing.
    expect(queryByText('Message seller')).toBeNull();

    fireEvent.press(getByText('Contact NannyNow'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/201001234567'),
    );
  });

  it('keeps in-app messaging for a seller listing', async () => {
    const { getByText, queryByText } = renderScreen(makeListing());

    await waitFor(() => expect(getByText('Message seller')).toBeTruthy());
    expect(queryByText('Contact NannyNow')).toBeNull();
  });
});
