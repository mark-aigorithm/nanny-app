import type { Conversation, ChatMessage } from '@mobile/types';
import {
  IMG_ELENA_MESSAGES,
  IMG_SARAH_MESSAGES,
  IMG_MAYA_MESSAGES,
  IMG_CLAIRE_MESSAGES,
  IMG_SANDRA_MESSAGES,
} from './images';

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    name: 'Elena Rodriguez',
    preview: "I'll be there by 8:00 AM tomorrow. \u2026",
    time: '10:24 AM',
    unreadCount: 2,
    isOnline: true,
    avatar: IMG_ELENA_MESSAGES,
  },
  {
    id: '2',
    name: 'Sarah Jenkins',
    preview: 'Thank you for the wonderful feedback! L\u2026',
    time: 'Yesterday',
    avatar: IMG_SARAH_MESSAGES,
  },
  {
    id: '3',
    name: 'Maya Patel',
    preview: "I've updated my availability for the upco\u2026",
    time: 'Tuesday',
    isVerified: true,
    avatar: IMG_MAYA_MESSAGES,
  },
  {
    id: '4',
    name: 'Claire Thompson',
    preview: "Sounds good, let's touch base next wee\u2026",
    time: 'Oct 12',
    opacity: 0.8,
    avatar: IMG_CLAIRE_MESSAGES,
  },
  {
    id: '5',
    name: 'Sandra Weber',
    preview: 'The school pickup went smoothly today.',
    time: 'Oct 10',
    opacity: 0.7,
    avatar: IMG_SANDRA_MESSAGES,
  },
];

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    type: 'received',
    text: 'Hi Sarah! I\'ll be there on time. Does Liam have any specific lunch preferences today?',
    time: '10:42 AM',
  },
  {
    id: '2',
    type: 'sent',
    text: 'Hi Elena, that\'s great. He loves the mashed sweet potatoes I\'ve prepared.',
    time: '10:45 AM',
  },
  {
    id: '3',
    type: 'received',
    text: 'Perfect, I\'ll make sure he enjoys that. See you soon!',
    time: '10:48 AM',
  },
  {
    id: '4',
    type: 'sent',
    text: 'See you tomorrow!',
    time: '10:50 AM',
  },
];
