import { create } from 'zustand';

type E2eGooglePickerState = {
  /** True while a request is waiting on the picker. */
  pending: boolean;
  resolver: ((email: string | null) => void) | null;
  request: () => Promise<string | null>;
  settle: (email: string | null) => void;
};

/**
 * Drives the E2E stand-in for Google's account sheet (E2eGooglePickerHost).
 * Only reached when the app points at the Auth emulator — see
 * lib/socialAuth.ts. A second request settles the first as cancelled.
 */
export const useE2eGooglePickerStore = create<E2eGooglePickerState>((set, get) => ({
  pending: false,
  resolver: null,
  request: () =>
    new Promise<string | null>((resolve) => {
      get().resolver?.(null);
      set({ pending: true, resolver: resolve });
    }),
  settle: (email) => {
    get().resolver?.(email);
    set({ pending: false, resolver: null });
  },
}));

/** Opens the picker and resolves with the typed address, or null on cancel. */
export function requestE2eGoogleEmail(): Promise<string | null> {
  return useE2eGooglePickerStore.getState().request();
}
