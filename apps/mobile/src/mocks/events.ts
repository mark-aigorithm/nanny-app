import type { EventData } from '@mobile/types';
import {
  IMG_EVENT_STORYTIME,
  IMG_EVENT_SIGN_LANGUAGE,
  IMG_AVATAR_SARAH_COMMUNITY,
  IMG_AVATAR_ELENA_COMMUNITY,
  IMG_AVATAR_DAVID_COMMUNITY,
} from './images';

export const MOCK_EVENTS: EventData[] = [
  {
    id: '1',
    title: 'Saturday Storytime & Playdate',
    month: 'APR',
    day: '19',
    image: IMG_EVENT_STORYTIME,
    ageRange: 'Ages 0-3',
    location: 'Prospect Park',
    attendees: [
      { id: '1', image: IMG_AVATAR_SARAH_COMMUNITY },
      { id: '2', image: IMG_AVATAR_ELENA_COMMUNITY },
      { id: '3', image: IMG_AVATAR_DAVID_COMMUNITY },
    ],
    goingCount: '+14 going',
  },
  {
    id: '2',
    title: 'Baby Sign Language Workshop',
    month: 'APR',
    day: '23',
    image: IMG_EVENT_SIGN_LANGUAGE,
    ageRange: 'Ages 6-18 months',
    location: 'Brooklyn Library',
    attendees: [
      { id: '1', image: IMG_AVATAR_SARAH_COMMUNITY },
      { id: '2', image: IMG_AVATAR_ELENA_COMMUNITY },
    ],
    goingCount: '8 going',
    spotsLeft: 'Only 2 spots left!',
    showJoinButton: true,
  },
];
