import { create } from 'zustand';

type GuestState = {
  /**
   * True while the app is browsed without an account ("Continue as guest"
   * on the splash screen). Guests get a read-only parent experience: every
   * interaction is intercepted by the register prompt. Not persisted — a
   * cold start lands on the splash screen again, which is the registration
   * nudge we want.
   */
  isGuest: boolean;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
};

export const useGuestStore = create<GuestState>((set) => ({
  isGuest: false,
  enterGuestMode: () => set({ isGuest: true }),
  exitGuestMode: () => set({ isGuest: false }),
}));
