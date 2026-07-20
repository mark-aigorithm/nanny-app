import { create } from 'zustand';

interface IdGateStore {
  /** Whether the forced ID-upload modal is open. */
  visible: boolean;
  /** Rejection reason to explain why a re-upload is needed (null = first upload). */
  reason: string | null;
  openIdGate: (reason?: string | null) => void;
  closeIdGate: () => void;
}

/**
 * Drives the mother-side ID-upload modal (mounted in the parent layout).
 * Opened via `useIdGate` when a mother with no verified ID taps a gated action
 * (e.g. Book care). Mirrors `registerPromptStore` — one global open/close flag.
 */
export const useIdGateStore = create<IdGateStore>((set) => ({
  visible: false,
  reason: null,
  openIdGate: (reason) => set({ visible: true, reason: reason ?? null }),
  closeIdGate: () => set({ visible: false, reason: null }),
}));
