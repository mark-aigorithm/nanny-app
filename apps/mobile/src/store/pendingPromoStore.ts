import { create } from 'zustand';

/**
 * A promo code handed off from a campaign tap to the booking flow. The carousel
 * sets it, and BookingStep1Screen reads it once on mount to prefill the promo
 * field, then clears it so it never leaks into a later, unrelated booking.
 */
type PendingPromoState = {
  pendingPromoCode: string | null;
  setPendingPromoCode: (code: string) => void;
  clear: () => void;
};

export const usePendingPromoStore = create<PendingPromoState>((set) => ({
  pendingPromoCode: null,
  setPendingPromoCode: (pendingPromoCode) => set({ pendingPromoCode }),
  clear: () => set({ pendingPromoCode: null }),
}));
