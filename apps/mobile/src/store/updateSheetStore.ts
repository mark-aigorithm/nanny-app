import { create } from 'zustand';

/**
 * Whether UpdateGate's optional "update available" sheet is on screen. The
 * survey and rating hosts wait while it is, so two sheets never stack at
 * launch; she sees theirs after Update or Later.
 */
interface UpdateSheetStore {
  visible: boolean;
  setVisible: (visible: boolean) => void;
  /**
   * "Later" was pressed since the app was last opened. Kept here, not in
   * UpdateGate's state, so a remount (the root layout re-renders on sign-in)
   * doesn't bring the prompt straight back; UpdateGate clears it on reopen.
   */
  dismissed: boolean;
  setDismissed: (dismissed: boolean) => void;
}

export const useUpdateSheetStore = create<UpdateSheetStore>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
  dismissed: false,
  setDismissed: (dismissed) => set({ dismissed }),
}));
