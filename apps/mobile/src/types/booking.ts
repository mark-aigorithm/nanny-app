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

export interface BookingDetail {
  id: string;
  nannyName: string;
  nannyPhoto: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  status: 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  date: string;
  dateFull: string;
  time: string;
  duration: number;
  location: string;
  specialInstructions: string;
  totalCharged: string;
  platformFee: string;
  paymentMethod: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
}
