import { create } from 'zustand';
import type { BookingResponse } from '@nanny-app/shared';

export type ShiftPromptKind =
  | 'shift_window'
  | 'confirm_end'
  | 'enter_pin'
  | 'error';

export interface ShiftPromptState {
  kind: ShiftPromptKind;
  booking?: BookingResponse;
  variant?: 'ready' | 'overdue';
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm?: () => void;
}

interface NannyShiftPromptStore {
  prompt: ShiftPromptState | null;
  showPrompt: (prompt: ShiftPromptState) => void;
  dismissPrompt: () => void;
}

export const useNannyShiftPromptStore = create<NannyShiftPromptStore>((set) => ({
  prompt: null,
  showPrompt: (prompt) => set({ prompt }),
  dismissPrompt: () => set({ prompt: null }),
}));

const alertedBookingIds = new Set<number>();

export function showShiftWindowPrompt(
  booking: BookingResponse,
  variant: 'ready' | 'overdue',
): void {
  if (alertedBookingIds.has(booking.id)) return;
  alertedBookingIds.add(booking.id);

  const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
  const isOverdue = variant === 'overdue';

  useNannyShiftPromptStore.getState().showPrompt({
    kind: 'shift_window',
    booking,
    variant,
    title: isOverdue ? 'Shift overdue' : 'Shift starting soon',
    message: isOverdue
      ? `Your booking with ${motherName} was scheduled to start. Start your shift when you arrive — she will be notified.`
      : `Your shift with ${motherName} can begin now. Start when you arrive — she will be notified.`,
    confirmLabel: 'Start shift',
  });
}

/**
 * Opens the 4-digit PIN entry so the nanny can start the shift. The parent must
 * have revealed the code on her phone; the nanny types it here to check in.
 */
export function showEnterPinPrompt(booking: BookingResponse): void {
  const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
  useNannyShiftPromptStore.getState().showPrompt({
    kind: 'enter_pin',
    booking,
    title: 'Enter start PIN',
    message: `Ask ${motherName} for the 4-digit code on her phone, then enter it to start the shift.`,
    confirmLabel: 'Start shift',
  });
}

export function showConfirmEndPrompt(
  booking: BookingResponse,
  onConfirm: () => void,
): void {
  const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
  useNannyShiftPromptStore.getState().showPrompt({
    kind: 'confirm_end',
    booking,
    title: 'End shift',
    message: `End shift and mark this booking complete? ${motherName} will be notified.`,
    confirmLabel: 'End shift',
    onConfirm,
  });
}

export function showShiftErrorPrompt(title: string, message: string): void {
  useNannyShiftPromptStore.getState().showPrompt({
    kind: 'error',
    title,
    message,
    confirmLabel: 'OK',
  });
}
