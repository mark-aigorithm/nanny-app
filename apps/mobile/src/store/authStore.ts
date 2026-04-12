import { create } from 'zustand';
import type { FirebaseUser } from '@mobile/lib/firebase';

type AuthState = {
  user: FirebaseUser | null;
  /**
   * True until the first `onAuthStateChanged` callback fires. Used by the
   * root layout to defer hiding the splash screen so a signed-in user
   * doesn't see a flash of the auth stack on cold launch.
   */
  isHydrating: boolean;
  setUser: (user: FirebaseUser | null) => void;
  markHydrated: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrating: true,
  setUser: (user) => set({ user }),
  markHydrated: () => set({ isHydrating: false }),
}));
