import { create } from 'zustand';
import type { UserResponse } from '@nanny-app/shared';

/**
 * Application User row returned by the backend (NOT the Firebase user).
 * Holds profile fields like name, role, and verification timestamps that
 * Firebase doesn't track. Hydrated by `useMe` after sign-in / cold launch.
 */
type UserProfileState = {
  profile: UserResponse | null;
  setProfile: (profile: UserResponse | null) => void;
  clear: () => void;
};

export const useUserProfileStore = create<UserProfileState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
  clear: () => set({ profile: null }),
}));
