import type { BookingConfirmation, UpcomingBooking, PastBooking, BookingDetail, PaymentMethod, TimeSlot } from '@mobile/types';
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

export const MOCK_BOOKING_DETAIL: BookingDetail = {
  id: 'b1',
  nannyName: 'Elena Martinez',
  nannyPhoto: IMG_ELENA_BOOKING,
  verified: true,
  rating: 5.0,
  reviewCount: 42,
  status: 'CONFIRMED',
  date: 'Sat, Apr 12',
  dateFull: 'Saturday, April 12, 2025',
  time: '9:00 AM - 5:00 PM',
  duration: 8,
  location: 'Upper West Side, New York',
  specialInstructions: 'Liam is allergic to peanuts. Please use the sunscreen in the diaper bag if going outside.',
  totalCharged: '$237.44',
  hourlyRate: 28,
  platformFee: '$13.44',
  paymentMethod: 'Visa ending in 4242',
};

export const MOCK_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'pm1',
    type: 'visa',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2027,
    isDefault: true,
    cardholderName: 'Sarah Johnson',
  },
  {
    id: 'pm2',
    type: 'mastercard',
    last4: '8888',
    expiryMonth: 6,
    expiryYear: 2026,
    isDefault: false,
    cardholderName: 'Sarah Johnson',
  },
  {
    id: 'pm3',
    type: 'apple_pay',
    last4: '',
    expiryMonth: 0,
    expiryYear: 0,
    isDefault: false,
    cardholderName: 'Sarah Johnson',
  },
];

export const MOCK_TIME_SLOTS: TimeSlot[] = [
  { id: 'ts1', label: '8:00 AM', startTime: '08:00', endTime: '09:00', available: true },
  { id: 'ts2', label: '9:00 AM', startTime: '09:00', endTime: '10:00', available: true },
  { id: 'ts3', label: '10:00 AM', startTime: '10:00', endTime: '11:00', available: true },
  { id: 'ts4', label: '11:00 AM', startTime: '11:00', endTime: '12:00', available: false },
  { id: 'ts5', label: '12:00 PM', startTime: '12:00', endTime: '13:00', available: true },
  { id: 'ts6', label: '1:00 PM', startTime: '13:00', endTime: '14:00', available: true },
  { id: 'ts7', label: '2:00 PM', startTime: '14:00', endTime: '15:00', available: true },
  { id: 'ts8', label: '3:00 PM', startTime: '15:00', endTime: '16:00', available: false },
  { id: 'ts9', label: '4:00 PM', startTime: '16:00', endTime: '17:00', available: true },
  { id: 'ts10', label: '5:00 PM', startTime: '17:00', endTime: '18:00', available: true },
  { id: 'ts11', label: '6:00 PM', startTime: '18:00', endTime: '19:00', available: true },
  { id: 'ts12', label: '7:00 PM', startTime: '19:00', endTime: '20:00', available: true },
];
