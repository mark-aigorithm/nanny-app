import type { ActivityItem, QuickEntry, LogEntry, LiveActivityItem, ChildInfo } from '@mobile/types';
import { colors } from '@mobile/theme';
import { IMG_MILK_BOTTLE, IMG_VIDEO_FEED } from './images';

export const MOCK_CHILD: ChildInfo = {
  name: 'Baby Liam',
  age: '8 months',
  lastActivity: 'Nap ended 45m ago',
};

export const QUICK_ENTRIES: QuickEntry[] = [
  { label: 'Meal', icon: 'restaurant', bg: colors.warmLight },
  { label: 'Nap', icon: 'moon', bg: colors.tintPurple },
  { label: 'Diaper', icon: 'happy', bg: colors.successLight },
  { label: 'Activity', icon: 'game-controller', bg: colors.tintYellow },
];

export const MOCK_LOG_ENTRIES: LogEntry[] = [
  {
    id: '1',
    type: 'diaper',
    title: 'Diaper Change',
    subtitle: 'Wet \u2022 Soft',
    time: '2:15 PM',
    iconBg: colors.successLight,
    icon: 'happy',
  },
  {
    id: '2',
    type: 'meal',
    title: 'Meal',
    subtitle: '150ml Formula',
    time: '12:45 PM',
    iconBg: colors.warmLight,
    icon: 'restaurant',
  },
  {
    id: '3',
    type: 'nap',
    title: 'Nap',
    subtitle: '45 minutes',
    time: '11:30 AM',
    iconBg: colors.tintPurple,
    icon: 'moon',
  },
];

export const TODAY_ACTIVITIES: ActivityItem[] = [
  {
    id: '1',
    type: 'Feeding',
    icon: 'restaurant-outline',
    iconBg: colors.warmLight,
    time: '1:30 PM',
    description: 'Elena fed Liam 6oz. He finished the whole bottle.',
    thumbnail: IMG_MILK_BOTTLE,
    unread: true,
  },
  {
    id: '2',
    type: 'Nap',
    icon: 'moon-outline',
    iconBg: colors.tintPurple,
    time: '12:15 PM',
    description: 'Liam fell asleep in his crib. He was very calm today.',
  },
  {
    id: '3',
    type: 'Diaper change',
    icon: 'leaf-outline',
    iconBg: colors.successLight,
    time: '11:45 AM',
    description: 'Wet diaper changed. No redness observed.',
  },
];

export const YESTERDAY_ACTIVITIES: ActivityItem[] = [
  {
    id: '4',
    type: 'Play time',
    icon: 'game-controller-outline',
    iconBg: colors.surfaceMuted,
    time: '3:00 PM',
    description: 'Liam enjoyed building blocks and stacking cups for 30 minutes.',
  },
];

export const MOCK_ACTIVITIES_LIVE: LiveActivityItem[] = [
  {
    id: '1',
    title: 'Motion detected',
    subtitle: '10:45 AM \u2022 Nursery Cam',
    icon: 'notifications-outline',
    borderColor: colors.primary,
    iconBg: colors.primaryMuted,
    iconColor: colors.primary,
  },
  {
    id: '2',
    title: 'Feeding started 6oz',
    subtitle: '09:30 AM \u2022 Kitchen',
    icon: 'restaurant-outline',
    borderColor: colors.bronze,
    iconBg: 'rgba(184,157,120,0.1)',
    iconColor: colors.bronze,
  },
  {
    id: '3',
    title: 'Nap started',
    subtitle: '08:15 AM \u2022 Nursery',
    icon: 'moon-outline',
    borderColor: colors.primaryDark,
    iconBg: 'rgba(85,98,81,0.1)',
    iconColor: colors.primaryDark,
  },
];

export { IMG_VIDEO_FEED };
