import type { UserProfile, AccountDetails } from '@mobile/types';
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
