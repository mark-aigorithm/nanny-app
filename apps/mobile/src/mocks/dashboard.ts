import type { PromoCard, QuickAction, NannyPreview, FavouriteNanny } from '@mobile/types';
import { colors } from '@mobile/theme';
import { IMG_HERO, IMG_ELENA_HOME, IMG_SARAH_HOME } from './images';

export const PROMO_CARDS: PromoCard[] = [
  {
    id: '1',
    title: 'Weekend Special',
    subtitle: '20% off first booking',
    cta: 'EXPLORE',
    image: IMG_HERO,
  },
  {
    id: '2',
    title: 'Pro Nannies',
    subtitle: 'Certified & background checked',
    cta: 'BOOK PRO',
    image: IMG_ELENA_HOME,
  },
];

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'book',
    label: 'Book now',
    icon: 'calendar',
    bgColor: colors.primaryMuted,
    iconColor: colors.primary,
    route: '/(parent)/search',
  },
  {
    id: 'emergency',
    label: 'Emergency',
    icon: 'alert-circle',
    bgColor: 'rgba(192,99,74,0.12)',
    iconColor: colors.error,
    route: '/(parent)/search',
  },
  {
    id: 'community',
    label: 'Community',
    icon: 'people',
    bgColor: colors.taupeLight,
    iconColor: colors.textTertiary,
    route: '/(parent)/community',
  },
  {
    id: 'monitor',
    label: 'Live monitor',
    icon: 'videocam',
    bgColor: colors.primaryMuted,
    iconColor: colors.primary,
    route: '/(parent)/nanny/live-video-monitor',
  },
];

export const RECOMMENDED_NANNIES: NannyPreview[] = [
  {
    id: '1',
    name: 'Elena R.',
    rating: 4.9,
    hourlyRate: 28,
    image: IMG_ELENA_HOME,
  },
  {
    id: '2',
    name: 'Sarah J.',
    rating: 5.0,
    hourlyRate: 32,
    image: IMG_SARAH_HOME,
  },
  {
    id: '3',
    name: 'Maria L.',
    rating: 4.8,
    hourlyRate: 25,
    image: IMG_SARAH_HOME,
  },
];

export const FAVOURITE_NANNIES: FavouriteNanny[] = [
  { id: '1', name: 'Elena', image: IMG_ELENA_HOME },
  { id: '2', name: 'Sarah', image: IMG_SARAH_HOME },
  { id: '3', name: 'Maria', image: IMG_ELENA_HOME },
];
