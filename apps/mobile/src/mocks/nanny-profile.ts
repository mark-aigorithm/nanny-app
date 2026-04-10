import type { NannyProfile } from '@mobile/types';
import { IMG_NANNY_HERO } from './images';

export const MOCK_NANNY_PROFILE: NannyProfile = {
  id: '1',
  name: 'Elena Martinez',
  hourlyRate: 28,
  rating: 4.9,
  reviewCount: 127,
  location: 'Brooklyn, NY',
  yearsExperience: 8,
  age: 29,
  ageRange: '0-5',
  verified: true,
  about:
    'Passionate childcare professional with 8 years of experience in early childhood education. I specialize in creating nurturing, stimulating environments where children can thrive and develop at their own pace. My approach combines Montessori principles with play-based learning.',
  certifications: [
    { id: '1', label: 'First Aid', icon: 'medkit-outline' },
    { id: '2', label: 'CPR', icon: 'heart-outline' },
    { id: '3', label: 'BG Check', icon: 'shield-checkmark-outline' },
    { id: '4', label: 'ECE Degree', icon: 'school-outline' },
  ],
  connectionsCount: 3,
  image: IMG_NANNY_HERO,
};
