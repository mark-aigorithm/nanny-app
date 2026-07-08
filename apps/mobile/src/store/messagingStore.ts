import { create } from 'zustand';

interface MessagingState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

export const useMessagingStore = create<MessagingState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
