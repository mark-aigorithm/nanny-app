import { create } from 'zustand';

/**
 * Whether UpdateGate's optional "update available" sheet is on screen. The
 * survey and rating hosts wait while it is, so two sheets never stack at
 * launch; she sees theirs after Update or Later.
 */
interface UpdateSheetStore {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export const useUpdateSheetStore = create<UpdateSheetStore>((set) => ({
  visible: false,
  setVisible: (visible) => set({ visible }),
}));
