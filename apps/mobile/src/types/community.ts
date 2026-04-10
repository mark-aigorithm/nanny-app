export type PostTag = 'General advice' | 'Marketplace' | 'Event';

export type CommunityTab = 'For You' | 'Local Groups';

export interface PostAuthor {
  name: string;
  avatar: string;
  timeAgo: string;
}

export interface BasePost {
  id: string;
  author: PostAuthor;
  tag: PostTag;
  likes: number;
  comments: number;
}

export interface AdvicePost extends BasePost {
  type: 'advice';
  body: string;
}

export interface MarketplacePost extends BasePost {
  type: 'marketplace';
  title: string;
  image: string;
  price: string;
}

export interface EventPost extends BasePost {
  type: 'event';
  title: string;
  date: string;
  location: string;
  attendeeAvatars: string[];
  attendeeCount: number;
}

export type Post = AdvicePost | MarketplacePost | EventPost;
