import { create } from 'zustand';
import type { Role, Child } from '@mobile/types';

export type RegistrationDraft = {
  role: Role | null;
  // Step 1 — personal info
  firstName: string;
  lastName: string;
  phone: string; // digits only, no country code
  countryCode: string; // e.g. '+1'
  dob: string;
  photoUri: string | null;
  // Nanny-only — front and back of the ID document (local URIs until uploaded
  // to Firebase Storage at submit). Mothers leave these null.
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
  children: Child[];
  preferences: string[];
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
  idFrontUri: null,
  idBackUri: null,
  password: '',
  address: '',
  neighbourhood: '',
  latitude: null,
  longitude: null,
  children: [{ name: '', age: '' }],
  preferences: ['Background checked', 'CPR certified'],
  termsAcceptedAt: null,
};

// Plain in-memory Zustand — NO `persist` middleware, because `password`
// must never touch AsyncStorage in plaintext.
export const useRegistrationDraftStore = create<RegistrationDraftState>((set) => ({
  ...INITIAL,
  patch: (partial) => set(partial),
  reset: () => set(INITIAL),
}));
