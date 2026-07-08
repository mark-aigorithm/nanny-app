import type {
  CommunityPostResponse,
  CommunityPostType,
  CommentResponse,
} from '@nanny-app/shared';

export type { CommunityPostResponse, CommunityPostType, CommentResponse };

export type CommunityTab = 'For You' | 'Local Groups';

export type CommunityFilterPill = 'All posts' | 'Q&A' | 'Marketplace' | 'Events';

export type CreatePostUiType = 'Q&A' | 'Marketplace' | 'Event';
