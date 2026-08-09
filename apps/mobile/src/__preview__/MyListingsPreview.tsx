/* TEMPORARY — visual-validation harness. Delete after screenshots. */
import React from 'react';
import { View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CommunityPostResponse } from '@nanny-app/shared';

import MyListingsScreen from '@mobile/screens/parent/MyListingsScreen';
import { setPreviewParams } from './harness';

setPreviewParams({});

function listing(overrides: Partial<CommunityPostResponse>): CommunityPostResponse {
  return {
    id: 1,
    type: 'marketplace',
    title: 'Stroller',
    body: null,
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
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const POSTS: CommunityPostResponse[] = [
  listing({
    id: 1,
    title: 'Baby stroller — barely used',
    price: 1200,
    moderationStatus: 'rejected',
    rejectionReason: 'The photos are too blurry to see the item — please add clearer ones.',
  }),
  listing({
    id: 2,
    title: 'Nursery chest of drawers',
    price: 2400,
    moderationStatus: 'pending',
  }),
  listing({
    id: 3,
    title: 'Bundle of 0–6m clothes',
    price: 350,
    moderationStatus: 'approved',
  }),
];

export default function MyListingsPreview() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['community', 'my-listings'], {
    pages: [{ posts: POSTS, meta: { page: 1, limit: 20, total: POSTS.length, totalPages: 1 } }],
    pageParams: [1],
  });

  return (
    <QueryClientProvider client={client}>
      <View style={{ width: 390, height: 844, overflow: 'hidden' }}>
        <MyListingsScreen />
      </View>
    </QueryClientProvider>
  );
}
