/** Preview-only mock data for web component previews. */

export interface MockAppNotification {
  id: string;
  type: 'booking' | 'activity' | 'social' | 'promo' | 'review';
  title: string;
  subtitle: string;
  time: string;
  read: boolean;
}

export const MOCK_NOTIFICATIONS: MockAppNotification[] = [
  {
    id: '1',
    type: 'booking',
    title: 'Booking confirmed',
    subtitle: 'Elena Martinez · Sat Apr 12 · 9AM–5PM',
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
];
