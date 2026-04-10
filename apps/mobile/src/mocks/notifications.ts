import type { AppNotification } from '@mobile/types';

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: '1',
    type: 'booking',
    title: 'Booking confirmed',
    subtitle: 'Elena Martinez \u00b7 Sat Apr 12 \u00b7 9AM\u20135PM',
    time: '2m ago',
    read: false,
  },
  {
    id: '2',
    type: 'activity',
    title: 'Liam had lunch',
    subtitle: 'Sarah gave Liam a bottle at 12:30 PM',
    time: '15m ago',
    read: false,
  },
  {
    id: '3',
    type: 'social',
    title: 'Jessica replied to your post',
    subtitle: '"That\u2019s a great tip! We do the same with our nanny..."',
    time: '1h ago',
    read: true,
  },
  {
    id: '4',
    type: 'promo',
    title: 'Weekend Special',
    subtitle: 'Get 15% off your next weekend booking. Limited time offer!',
    time: '3h ago',
    read: true,
  },
  {
    id: '5',
    type: 'review',
    title: 'Share your feedback',
    subtitle: 'How was your experience with Elena? Leave a review.',
    time: '5h ago',
    read: true,
  },
];
