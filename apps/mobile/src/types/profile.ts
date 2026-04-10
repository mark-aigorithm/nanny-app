import type { Ionicons } from '@expo/vector-icons';

export interface SettingsItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  isDestructive?: boolean;
}

export interface UserProfile {
  name: string;
  location: string;
  memberTier: string;
  walletBalance: number;
  rewardPoints: number;
  rewardValue: number;
  favouriteNanniesCount: number;
}

export interface AccountDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  photo: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}
