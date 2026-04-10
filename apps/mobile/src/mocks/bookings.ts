import type { BookingConfirmation, UpcomingBooking, PastBooking } from '@mobile/types';
import { IMG_ELENA_BOOKING, IMG_SARAH_HOME, IMG_NANNY_ELENA_SEARCH } from './images';

export const MOCK_BOOKING: BookingConfirmation = {
  nannyName: 'Elena Martinez',
  nannyPhoto: IMG_ELENA_BOOKING,
  verified: true,
  date: 'Sat, Apr 12',
  dateFull: 'Saturday, Apr 12',
  time: '06:00 PM - 11:00 PM',
  location: 'Upper West Side',
  charged: '$189.95',
};

export const MOCK_UPCOMING_BOOKINGS: UpcomingBooking[] = [
  {
    id: 'b1',
    nannyName: 'Elena Martinez',
    nannyPhoto: IMG_ELENA_BOOKING,
    verified: true,
    rating: 5.0,
    reviewCount: 42,
    status: 'CONFIRMED',
    date: 'Monday, Oct 24, 2023',
    time: '09:00 AM - 04:00 PM',
  },
  {
    id: 'b2',
    nannyName: 'Sarah Jenkins',
    nannyPhoto: IMG_SARAH_HOME,
    verified: true,
    rating: 4.9,
    reviewCount: 118,
    status: 'CONFIRMED',
    date: 'Friday, Oct 28, 2023',
    time: '05:00 PM - 10:00 PM',
  },
];

export const MOCK_PAST_BOOKINGS: PastBooking[] = [
  {
    id: 'b3',
    nannyName: 'Maria Rodriguez',
    nannyPhoto: IMG_NANNY_ELENA_SEARCH,
    bookedTimes: 3,
    status: 'COMPLETED',
    hasReview: false,
  },
];
