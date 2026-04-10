export type BookingTabKey = 'upcoming' | 'past' | 'cancelled';

export interface UpcomingBooking {
  id: string;
  nannyName: string;
  nannyPhoto: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  status: 'CONFIRMED' | 'PENDING';
  date: string;
  time: string;
}

export interface PastBooking {
  id: string;
  nannyName: string;
  nannyPhoto: string;
  bookedTimes: number;
  status: 'COMPLETED';
  hasReview: boolean;
}

export interface BookingConfirmation {
  nannyName: string;
  nannyPhoto: string;
  verified: boolean;
  date: string;
  dateFull: string;
  time: string;
  location: string;
  charged: string;
}
