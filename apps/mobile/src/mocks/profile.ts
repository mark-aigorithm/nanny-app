import type { SettingsItem, UserProfile, AccountDetails } from '@mobile/types';
import { IMG_PROFILE_PHOTO } from './images';

export const MOCK_PROFILE: UserProfile = {
  name: 'Sarah Johnson',
  location: 'Brooklyn, NY',
  memberTier: 'Pro Member',
  walletBalance: 47.5,
  rewardPoints: 320,
  rewardValue: 3.2,
  favouriteNanniesCount: 5,
};

export const SETTINGS_ITEMS: SettingsItem[] = [
  { id: 'account', label: 'Account details', icon: 'person-outline' },
  { id: 'nannies', label: 'My nannies', icon: 'heart-outline', badge: '5' },
  { id: 'payment', label: 'Payment methods', icon: 'card-outline' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications-outline' },
  { id: 'help', label: 'Help & support', icon: 'help-circle-outline' },
  { id: 'logout', label: 'Log out', icon: 'log-out-outline', isDestructive: true },
];

export const MOCK_ACCOUNT_DETAILS: AccountDetails = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  email: 'sarah.johnson@email.com',
  phone: '+1 (555) 123-4567',
  photo: IMG_PROFILE_PHOTO,
  address: '123 Park Slope Ave',
  city: 'Brooklyn',
  state: 'NY',
  zipCode: '11215',
};
