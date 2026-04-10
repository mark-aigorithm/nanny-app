export interface NannyEarnings {
  thisWeek: number;
  thisMonth: number;
  total: number;
}

export interface NannyBookingRequest {
  id: string;
  parentName: string;
  parentPhoto: string;
  date: string;
  time: string;
  duration: number;
  childrenCount: number;
  location: string;
  hourlyRate: number;
  totalAmount: number;
  status: 'pending' | 'accepted' | 'declined';
  requestedAt: string;
  specialInstructions?: string;
}

export interface NannyStats {
  totalBookings: number;
  repeatClients: number;
  averageRating: number;
  responseRate: number;
}

export interface NannyAvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface NannyProfileEdit {
  name: string;
  bio: string;
  hourlyRate: number;
  certifications: string[];
  ageRange: string;
  image: string;
  location: string;
  yearsExperience: number;
}
