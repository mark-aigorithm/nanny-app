import type { CommunityPostResponse, CommunityPostType, PaginationMeta } from '@nanny-app/shared';

import { formatMoney } from './formatMoney';

export function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function formatAuthorName(author: CommunityPostResponse['author']): string {
  return `${author.firstName} ${author.lastName}`.trim();
}

export function formatPrice(price: number | null): string {
  if (price === null) return 'Free';
  return formatMoney(price, { fractionDigits: 0 });
}

export function formatEventDate(isoDate: string | null): string {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getPostTypeLabel(type: CommunityPostType): string {
  switch (type) {
    case 'qa':
      return 'Q&A';
    case 'marketplace':
      return 'Marketplace';
    case 'event':
      return 'Event';
  }
}

export function getPostTypeTagStyle(type: CommunityPostType): 'qa' | 'marketplace' | 'event' {
  return type;
}

export type CommunityFeedFilter = CommunityPostType | undefined;

export function filterPillToType(pill: string): CommunityFeedFilter {
  switch (pill) {
    case 'Q&A':
      return 'qa';
    case 'Marketplace':
      return 'marketplace';
    case 'Events':
      return 'event';
    default:
      return undefined;
  }
}

export function filterPostsBySearch(
  posts: CommunityPostResponse[],
  query: string,
): CommunityPostResponse[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return posts;

  return posts.filter((post) => {
    const haystack = [
      post.title,
      post.body,
      post.location,
      formatAuthorName(post.author),
      ...post.tags,
      getPostTypeLabel(post.type),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function createTypeToUi(type: CommunityPostType): 'Q&A' | 'Marketplace' | 'Event' {
  switch (type) {
    case 'qa':
      return 'Q&A';
    case 'marketplace':
      return 'Marketplace';
    case 'event':
      return 'Event';
  }
}

export function uiTypeToCreate(type: 'Q&A' | 'Marketplace' | 'Event'): CommunityPostType {
  switch (type) {
    case 'Q&A':
      return 'qa';
    case 'Marketplace':
      return 'marketplace';
    case 'Event':
      return 'event';
  }
}

export type PostsPage = {
  posts: CommunityPostResponse[];
  meta: PaginationMeta;
};

export type CommentsPage = {
  comments: import('@nanny-app/shared').CommentResponse[];
  meta: PaginationMeta;
};

export type CommunityReturnTo = 'community' | 'community-feed';

export function getCommunityReturnHref(params: {
  returnTo?: string;
  filter?: string;
}): { pathname: string; params?: { filter: string } } {
  if (params.returnTo === 'community-feed') {
    return {
      pathname: '/(parent)/community-feed',
      ...(params.filter ? { params: { filter: params.filter } } : {}),
    };
  }
  return {
    pathname: '/(parent)/community',
    ...(params.filter ? { params: { filter: params.filter } } : {}),
  };
}

/** @deprecated Use getCommunityReturnHref */
export const getCreatePostExitHref = getCommunityReturnHref;
export type CreatePostReturnTo = CommunityReturnTo;
