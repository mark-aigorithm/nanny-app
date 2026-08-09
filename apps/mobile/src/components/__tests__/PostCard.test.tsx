import React from 'react';
import { render } from '@testing-library/react-native';
import type { CommunityPostResponse } from '@nanny-app/shared';

import PostCard from '@mobile/components/community/PostCard';

function makeListing(overrides: Partial<CommunityPostResponse> = {}): CommunityPostResponse {
  return {
    id: 44,
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
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('PostCard — marketplace listings', () => {
  it('shows an official listing as NannyNow with the Official badge', () => {
    const { getByText, queryByText } = render(
      <PostCard
        post={makeListing({
          isOfficial: true,
          contactPhone: '+201001234567',
          author: { id: 3, firstName: 'Admin', lastName: 'User', avatarUrl: null },
        })}
      />,
    );

    expect(getByText('NannyNow')).toBeTruthy();
    expect(getByText('Official')).toBeTruthy();
    expect(queryByText('Admin User')).toBeNull();
  });

  it('shows the seller name on a normal listing', () => {
    const { getByText, queryByText } = render(<PostCard post={makeListing()} />);

    expect(getByText('Jane Doe')).toBeTruthy();
    expect(queryByText('Official')).toBeNull();
  });

  it('flags a listing awaiting review', () => {
    const { getByText } = render(
      <PostCard post={makeListing({ moderationStatus: 'pending' })} />,
    );

    expect(getByText('Under review')).toBeTruthy();
  });

  it('flags a rejected listing as needing changes', () => {
    const { getByText } = render(
      <PostCard
        post={makeListing({ moderationStatus: 'rejected', rejectionReason: 'Blurry photos' })}
      />,
    );

    expect(getByText('Needs changes')).toBeTruthy();
  });

  it('shows no moderation chip on a live listing', () => {
    const { queryByText } = render(<PostCard post={makeListing()} />);

    expect(queryByText('Under review')).toBeNull();
    expect(queryByText('Needs changes')).toBeNull();
  });
});
