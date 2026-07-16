import { create } from 'zustand';

const DEFAULT_MESSAGE =
  'Create your free account to book trusted nannies, join the community and message directly.';

interface RegisterPromptStore {
  /** Message shown in the prompt; null means the prompt is closed. */
  message: string | null;
  showRegisterPrompt: (message?: string) => void;
  dismissRegisterPrompt: () => void;
}

/**
 * Global "create your account" prompt for guest browsing. Any gated
 * interaction calls `showRegisterPrompt` (usually via `useGuestGate`) and the
 * modal host in the parent layout renders it.
 */
export const useRegisterPromptStore = create<RegisterPromptStore>((set) => ({
  message: null,
  showRegisterPrompt: (message) => set({ message: message ?? DEFAULT_MESSAGE }),
  dismissRegisterPrompt: () => set({ message: null }),
}));
