import type { Post } from '@mobile/types';
import {
  IMG_AVATAR_SARAH_COMMUNITY,
  IMG_AVATAR_ELENA_COMMUNITY,
  IMG_AVATAR_DAVID_COMMUNITY,
  IMG_POST_ROOM,
} from './images';

export const MOCK_POSTS: Post[] = [
  {
    id: '1',
    type: 'advice',
    author: {
      name: 'Jessica K.',
      avatar: IMG_AVATAR_SARAH_COMMUNITY,
      timeAgo: '2h ago',
    },
    tag: 'General advice',
    body: 'Does anyone have a recommendation for a paediatric dentist in Park Slope?',
    likes: 24,
    comments: 8,
  },
  {
    id: '2',
    type: 'marketplace',
    author: {
      name: 'Maria T.',
      avatar: IMG_AVATAR_ELENA_COMMUNITY,
      timeAgo: '5h ago',
    },
    tag: 'Marketplace',
    title: 'UppaBaby Vista V2 - Gently used',
    image: IMG_POST_ROOM,
    price: '$320',
    likes: 6,
    comments: 3,
  },
  {
    id: '3',
    type: 'event',
    author: {
      name: 'Sophie L.',
      avatar: IMG_AVATAR_DAVID_COMMUNITY,
      timeAgo: 'Just now',
    },
    tag: 'Event',
    title: 'Saturday Storytime @ Prospect Park',
    date: 'Saturday, Apr 19 \u2022 10:30 AM',
    location: 'Prospect Park, Brooklyn',
    attendeeAvatars: [IMG_AVATAR_SARAH_COMMUNITY, IMG_AVATAR_ELENA_COMMUNITY, IMG_AVATAR_DAVID_COMMUNITY],
    attendeeCount: 14,
    likes: 0,
    comments: 0,
  },
];
