import { create } from 'zustand';

interface MessagingState {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  /** The booking whose chat is on screen, so its pushes refresh rather than notify. */
  activeBookingChatId: string | null;
  setActiveBookingChatId: (id: string | null) => void;
}

export const useMessagingStore = create<MessagingState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  activeBookingChatId: null,
  setActiveBookingChatId: (id) => set({ activeBookingChatId: id }),
}));
