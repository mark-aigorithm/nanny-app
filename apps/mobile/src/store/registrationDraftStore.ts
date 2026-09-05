import { create } from 'zustand';
import type { AvailabilityType, IdDocumentType, WeeklySchedule } from '@nanny-app/shared';
import type { Role } from '@mobile/types';

export type RegistrationDraft = {
  role: Role | null;
  // Step 1 — personal info
  firstName: string;
  lastName: string;
  phone: string; // digits only, no country code
  countryCode: string; // e.g. '+1'
  dob: string;
  photoUri: string | null;
  // The real email address, collected on step 1 and verified on the step right
  // after it — both roles. `emailVerificationToken` is the proof from
  // POST /auth/email/verify, spent by POST /auth/register at the end of the
  // wizard. Sign-in stays the phone number for everyone.
  email: string;
  emailVerificationToken: string | null;
  // Nanny-only — the ID document type + front/back images (local URIs until
  // uploaded to Firebase Storage at submit). A passport needs only the front.
  // Mothers leave these null.
  idDocumentType: IdDocumentType | null;
  idFrontUri: string | null;
  idBackUri: string | null;
  // Step 2 — password (in-memory only, never persisted to disk)
  password: string;
  // Step 3 — location & preferences
  address: string;
  neighbourhood: string;
  // Home coordinates from the map picker; null until the user sets the pin.
  latitude: number | null;
  longitude: number | null;
  preferences: string[];
  // Nanny-only — professional details captured on the "register-nanny-details"
  // screen. Mothers leave these at their defaults. Kept as strings where the
  // profile-edit screen also keeps them as strings (bio, yearsOfExperience) —
  // parsed into the API shape only when building the register request.
  bio: string;
  yearsOfExperience: string;
  ageRanges: string[];
  availabilityType: AvailabilityType | null;
  schedule: WeeklySchedule | null;
  certificationIds: number[];
  skillIds: number[];
  // Step 4 — terms
  termsAcceptedAt: number | null;
};

type RegistrationDraftState = RegistrationDraft & {
  patch: (partial: Partial<RegistrationDraft>) => void;
  reset: () => void;
};

const INITIAL: RegistrationDraft = {
  role: null,
  firstName: '',
  lastName: '',
  phone: '',
  countryCode: '+20',
  dob: '',
  photoUri: null,
  email: '',
  emailVerificationToken: null,
  idDocumentType: null,
  idFrontUri: null,
  idBackUri: null,
  password: '',
  address: '',
  neighbourhood: '',
  latitude: null,
  longitude: null,
  preferences: ['Background checked', 'CPR certified'],
  bio: '',
  yearsOfExperience: '',
  ageRanges: [],
  availabilityType: null,
  schedule: null,
  certificationIds: [],
  skillIds: [],
  termsAcceptedAt: null,
};

// Plain in-memory Zustand — NO `persist` middleware, because `password`
// must never touch AsyncStorage in plaintext.
export const useRegistrationDraftStore = create<RegistrationDraftState>((set) => ({
  ...INITIAL,
  patch: (partial) => set(partial),
  reset: () => set(INITIAL),
}));
