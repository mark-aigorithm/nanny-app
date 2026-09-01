import { create } from 'zustand';

interface EmailGateStore {
  /** Whether the email-verification modal is open. */
  visible: boolean;
  openEmailGate: () => void;
  closeEmailGate: () => void;
}

/**
 * Drives the mother-side email-verification modal (mounted in the parent
 * layout). Opened via `useEmailGate` when a mother without a verified address
 * taps a gated action (Book care). Mirrors `idGateStore` — one global
 * open/close flag — so the two gates compose without knowing about each other.
 */
export const useEmailGateStore = create<EmailGateStore>((set) => ({
  visible: false,
  openEmailGate: () => set({ visible: true }),
  closeEmailGate: () => set({ visible: false }),
}));
