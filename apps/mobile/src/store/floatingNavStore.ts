import { create } from 'zustand';

type FloatingNavState = {
  /**
   * The parent floating tab bar's pill as last laid out, or null before its
   * first layout. Its height follows the OS font size (the tab labels grow),
   * so screens that float things above it read this rather than a constant.
   */
  pillHeight: number | null;
  setPillHeight: (height: number) => void;
};

export const useFloatingNavStore = create<FloatingNavState>((set) => ({
  pillHeight: null,
  setPillHeight: (height) => set({ pillHeight: height }),
}));
