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
  hourlyRate: number;
  platformFee: string;
  paymentMethod: string;
}

export interface PaymentMethod {
  id: string;
  type: 'visa' | 'mastercard' | 'amex' | 'apple_pay' | 'google_pay';
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  cardholderName: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  available: boolean;
}
