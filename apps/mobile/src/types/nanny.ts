import type { Ionicons } from '@expo/vector-icons';

export interface NannyBase {
  id: string;
  name: string;
  rating: number;
  hourlyRate: number;
  image: string;
  verified: boolean;
}

/** HomeScreen — full nanny card */
export interface NannyData extends NannyBase {
  experience: string;
  distance: string;
  bio: string;
}

/** SearchScreen — search card */
export interface NannyCardData extends NannyBase {
  experience: string;
  type: string;
  specialties?: string[];
}

/** SearchResultsScreen — result row */
export interface NannyResult {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  distance: string;
  experience: string;
  hourlyRate: number;
  verified: boolean;
  /** 0-1 opacity; defaults to 1 */
  opacity?: number;
}

/** HomeDashboardScreen — compact preview */
export type NannyPreview = Pick<NannyBase, 'id' | 'name' | 'rating' | 'hourlyRate' | 'image'>;

/** HomeDashboardScreen — favourites */
export type FavouriteNanny = Pick<NannyBase, 'id' | 'name' | 'image'>;

/** NannyProfileScreen — full profile */
export interface NannyProfile {
  id: string;
  name: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  location: string;
  yearsExperience: number;
  age: number;
  ageRange: string;
  verified: boolean;
  about: string;
  certifications: NannyCertification[];
  connectionsCount: number;
  image: string;
}

export interface NannyCertification {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** NannyProfileScreen — review */
export interface NannyReview {
  id: string;
  authorInitial: string;
  authorName: string;
  timeAgo: string;
  rating: number;
  text: string;
}

/** BookingStep1Screen — compact nanny for booking */
export interface NannyBookingSummary {
  name: string;
  rating: number;
  hourlyRate: number;
  image: string;
}
