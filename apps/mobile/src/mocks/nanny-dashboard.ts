import type {
  NannyEarnings,
  NannyBookingRequest,
  NannyStats,
  NannyAvailabilitySlot,
  NannyProfileEdit,
} from '@mobile/types';
import { IMG_USER_AVATAR, IMG_SARAH_HOME, IMG_ELENA_HOME, IMG_NANNY_HERO } from './images';

export const MOCK_NANNY_EARNINGS: NannyEarnings = {
  thisWeek: 672,
  thisMonth: 2340,
  total: 18450,
};

export const MOCK_NANNY_STATS: NannyStats = {
  totalBookings: 156,
  repeatClients: 12,
  averageRating: 4.9,
  responseRate: 98,
};

export const MOCK_NANNY_REQUESTS: NannyBookingRequest[] = [
  {
    id: 'nr1',
    parentName: 'Sarah Johnson',
    parentPhoto: IMG_USER_AVATAR,
    date: 'Saturday, Apr 19',
    time: '9:00 AM - 5:00 PM',
    duration: 8,
    childrenCount: 2,
    location: 'Upper West Side, NY',
    hourlyRate: 28,
    totalAmount: 224,
    status: 'pending',
    requestedAt: '2 hours ago',
    specialInstructions: 'Liam has a peanut allergy. Emma needs help with her reading homework.',
  },
  {
    id: 'nr2',
    parentName: 'Jessica Williams',
    parentPhoto: IMG_SARAH_HOME,
    date: 'Monday, Apr 21',
    time: '8:00 AM - 1:00 PM',
    duration: 5,
    childrenCount: 1,
    location: 'Park Slope, Brooklyn',
    hourlyRate: 28,
    totalAmount: 140,
    status: 'pending',
    requestedAt: '5 hours ago',
  },
  {
    id: 'nr3',
    parentName: 'Maria Chen',
    parentPhoto: IMG_ELENA_HOME,
    date: 'Wednesday, Apr 16',
    time: '2:00 PM - 7:00 PM',
    duration: 5,
    childrenCount: 1,
    location: 'Brooklyn Heights',
    hourlyRate: 28,
    totalAmount: 140,
    status: 'accepted',
    requestedAt: '1 day ago',
  },
  {
    id: 'nr4',
    parentName: 'Amy Roberts',
    parentPhoto: IMG_SARAH_HOME,
    date: 'Tuesday, Apr 8',
    time: '10:00 AM - 3:00 PM',
    duration: 5,
    childrenCount: 2,
    location: 'Cobble Hill',
    hourlyRate: 28,
    totalAmount: 140,
    status: 'declined',
    requestedAt: '3 days ago',
  },
];

export const MOCK_NANNY_AVAILABILITY: NannyAvailabilitySlot[] = [
  { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', available: true },
  { dayOfWeek: 1, startTime: '13:00', endTime: '18:00', available: true },
  { dayOfWeek: 2, startTime: '08:00', endTime: '12:00', available: true },
  { dayOfWeek: 2, startTime: '13:00', endTime: '18:00', available: false },
  { dayOfWeek: 3, startTime: '08:00', endTime: '12:00', available: true },
  { dayOfWeek: 3, startTime: '13:00', endTime: '18:00', available: true },
  { dayOfWeek: 4, startTime: '08:00', endTime: '12:00', available: false },
  { dayOfWeek: 4, startTime: '13:00', endTime: '18:00', available: false },
  { dayOfWeek: 5, startTime: '08:00', endTime: '12:00', available: true },
  { dayOfWeek: 5, startTime: '13:00', endTime: '18:00', available: true },
  { dayOfWeek: 6, startTime: '09:00', endTime: '14:00', available: true },
  { dayOfWeek: 0, startTime: '00:00', endTime: '00:00', available: false },
];

export const MOCK_NANNY_PROFILE_EDIT: NannyProfileEdit = {
  name: 'Elena Martinez',
  bio: 'Passionate childcare professional with 8 years of experience in early childhood education. I specialize in creating nurturing, stimulating environments where children can thrive.',
  hourlyRate: 28,
  certifications: ['First Aid', 'CPR', 'Background Check', 'ECE Degree'],
  ageRange: '0-5',
  image: IMG_NANNY_HERO,
  location: 'Brooklyn, NY',
  yearsExperience: 8,
};
