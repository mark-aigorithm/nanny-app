import { create } from 'zustand';
import type { BookingResponse } from '@nanny-app/shared';

interface RatingPromptStore {
  booking: BookingResponse | null;
  showRatingPrompt: (booking: BookingResponse) => void;
  clearRatingPrompt: () => void;
}

export const useRatingPromptStore = create<RatingPromptStore>((set) => ({
  booking: null,
  showRatingPrompt: (booking) => set({ booking }),
  clearRatingPrompt: () => set({ booking: null }),
}));

// Bookings the parent has already rated this session. Detection skips these so a
// just-submitted rating can't immediately reopen the sheet before queries settle.
// Cleared naturally on app relaunch (module reload).
const resolvedBookingIds = new Set<number>();

export function markRatingResolved(bookingId: number): void {
  resolvedBookingIds.add(bookingId);
}

export function isRatingResolved(bookingId: number): boolean {
  return resolvedBookingIds.has(bookingId);
}
