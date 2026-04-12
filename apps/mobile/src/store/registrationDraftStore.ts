import { create } from 'zustand';
import type { Role, Child } from '@mobile/types';

export type RegistrationDraft = {
  role: Role | null;
  // Step 1 — personal info
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // digits only, no country code
  countryCode: string; // e.g. '+1'
  dob: string;
  photoUri: string | null;
  // Step 2 — password (in-memory only, never persisted to disk)
  password: string;
  // Step 3 — location & preferences
  address: string;
  neighbourhood: string;
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
  email: '',
  phone: '',
  countryCode: '+20',
  dob: '',
  photoUri: null,
  password: '',
  address: '',
  neighbourhood: '',
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
