import { create } from 'zustand';
import type { AgeRange, AvailabilityType, IdDocumentType, WeeklySchedule } from '@nanny-app/shared';
import type { AuthCredential } from '@mobile/lib/firebase';
import type { AuthProvider, Role } from '@mobile/types';

/**
 * A photo already uploaded to Firebase Storage, and the local image it was
 * uploaded from — so a screen re-uploads only when the image has changed.
 */
export type DraftUpload = { uri: string; url: string };

/** The upload for `uri`, if it is the one already made; otherwise null. */
export function uploadFor(upload: DraftUpload | null, uri: string | null): string | null {
  return upload && uri && upload.uri === uri ? upload.url : null;
}

export type RegistrationDraft = {
  role: Role | null;
  // How this registration started. 'phone' is the full wizard; 'google' or
  // 'apple' means the user already signed in with that provider, which
  // supplied a verified email — so there is no "Secure your account" step,
  // and "Your number" links the phone onto that account instead of signing
  // in with it.
  authProvider: AuthProvider;
  // The Google/Apple credential that started a social registration, kept so
  // that a collision can move it into pendingLinkStore and link it onto the
  // existing account. In-memory only, like `password` below.
  socialCredential: AuthCredential | null;
  // The Firebase uid this sign-up is finishing: the account Google/Apple
  // signed in as when `/auth/me` said 404, or the leftover account the root
  // gate found with no row, or the phone-only account "Your number" just
  // signed in as. Collision B may delete only this account, and no later step
  // touches any other.
  signUpUid: string | null;
  // True when the root gate found a signed-in account with no row and started
  // this draft from it ("Finish setting up your account").
  isResume: boolean;
  // The E.164 phone on the Firebase account, if any: seeded from a resumed
  // account, or set once "Your number" has verified it.
  accountPhone: string | null;
  // Whether the account already held a number when the draft was seeded, so
  // the wizard skips "Your number". Fixed for the attempt (see
  // lib/registrationSteps), where `accountPhone` changes on the way.
  phoneOnAccountAtStart: boolean;
  // The (lowercased) email of a `password` provider already on the account.
  // When it matches the verified email, "Secure your account" keeps it.
  passwordEmail: string | null;
  // "Your number"
  phone: string; // digits only, no country code
  countryCode: string; // e.g. '+20'
  // "About you"
  firstName: string;
  lastName: string;
  dob: string;
  photoUri: string | null;
  avatarUpload: DraftUpload | null;
  // The real email address, typed on "About you" and verified on "Secure your
  // account" — `emailVerificationToken` is the proof from
  // POST /auth/email/verify, for `verifiedEmail`, spent by POST /auth/register
  // at the end. In the phone wizard it is also the email/password
  // credential's address; a social draft takes it from Google/Apple instead.
  email: string;
  emailVerificationToken: string | null;
  verifiedEmail: string | null;
  // Nanny-only — the ID document type + front/back images, uploaded on the
  // ID step. A passport needs only the front. Mothers leave these null.
  idDocumentType: IdDocumentType | null;
  idFrontUri: string | null;
  idBackUri: string | null;
  idFrontUpload: DraftUpload | null;
  idBackUpload: DraftUpload | null;
  // "Secure your account" — in memory only, never persisted to disk. Kept
  // here, not in the screen, so Back and forward again doesn't empty it.
  password: string;
  // Location (& a mother's preferences)
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
  ageRanges: AgeRange[];
  availabilityType: AvailabilityType | null;
  schedule: WeeklySchedule | null;
  certificationIds: number[];
  skillIds: number[];
};

type RegistrationDraftState = RegistrationDraft & {
  patch: (partial: Partial<RegistrationDraft>) => void;
  reset: () => void;
};

const INITIAL: RegistrationDraft = {
  role: null,
  authProvider: 'phone',
  socialCredential: null,
  signUpUid: null,
  isResume: false,
  accountPhone: null,
  phoneOnAccountAtStart: false,
  passwordEmail: null,
  phone: '',
  countryCode: '+20',
  firstName: '',
  lastName: '',
  dob: '',
  photoUri: null,
  avatarUpload: null,
  email: '',
  emailVerificationToken: null,
  verifiedEmail: null,
  idDocumentType: null,
  idFrontUri: null,
  idBackUri: null,
  idFrontUpload: null,
  idBackUpload: null,
  password: '',
  address: '',
  neighbourhood: '',
  latitude: null,
  longitude: null,
  // Nothing is chosen for her — she ticks what matters.
  preferences: [],
  bio: '',
  yearsOfExperience: '',
  ageRanges: [],
  availabilityType: null,
  schedule: null,
  certificationIds: [],
  skillIds: [],
};

// Plain in-memory Zustand — NO `persist` middleware, because `password`
// must never touch AsyncStorage in plaintext.
export const useRegistrationDraftStore = create<RegistrationDraftState>((set) => ({
  ...INITIAL,
  patch: (partial) => set(partial),
  reset: () => set(INITIAL),
}));
