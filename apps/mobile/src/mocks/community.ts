import type { Post, Comment } from '@mobile/types';
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

export const MOCK_COMMENTS: Comment[] = [
  {
    id: 'c1',
    author: { name: 'Elena R.', avatar: IMG_AVATAR_ELENA_COMMUNITY, timeAgo: '1h ago' },
    text: 'We love Dr. Park on 5th Avenue! She is amazing with kids and the office is really calm.',
    likes: 8,
    replies: [
      {
        id: 'c1r1',
        author: { name: 'Jessica K.', avatar: IMG_AVATAR_SARAH_COMMUNITY, timeAgo: '45m ago' },
        text: 'Thanks Elena! I will check her out.',
        likes: 2,
        replies: [],
      },
    ],
  },
  {
    id: 'c2',
    author: { name: 'David C.', avatar: IMG_AVATAR_DAVID_COMMUNITY, timeAgo: '30m ago' },
    text: 'Dr. Williams on Atlantic Ave is also great. Very gentle and patient.',
    likes: 5,
    replies: [],
  },
  {
    id: 'c3',
    author: { name: 'Sophie L.', avatar: IMG_AVATAR_ELENA_COMMUNITY, timeAgo: '15m ago' },
    text: 'Following this thread! We need a new dentist too.',
    likes: 1,
    replies: [],
  },
];
