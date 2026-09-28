import type { BookingResponse } from '@nanny-app/shared';

import { useCancelExtension, useEndBooking, useRequestExtension } from '@mobile/hooks/useBookings';
import { confirmDialog, noticeDialog } from '@mobile/store/confirmDialogStore';

export function hourLabel(hours: number): string {
  return `+${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * What a mother can do to a running shift — end it, ask for more hours, or
 * withdraw that ask — each behind the same confirmation she has always seen.
 *
 * Shared by the live card on Booking details (end / extend) and the extension
 * card beneath it (withdraw / pay), so the two can never word a dialog
 * differently.
 */
export function useShiftActions(booking: BookingResponse, onRequested?: () => void) {
  const endBooking = useEndBooking();
  const requestExtension = useRequestExtension();
  const cancelExtension = useCancelExtension();
  const nannyName = booking.nanny?.firstName ?? 'your nanny';

  const end = () => {
    confirmDialog({
      title: 'End this booking?',
      message: `This ends the shift now and ${nannyName} will be told you're done. The hours you've already paid for aren't refunded.`,
      confirmLabel: 'End booking',
      cancelLabel: 'Keep going',
      destructive: true,
      onConfirm: () =>
        endBooking.mutate(booking.id, {
          onError: (err) =>
            noticeDialog({ title: 'Could not end the booking', message: err.message }),
        }),
    });
  };

  const requestHours = (hours: number) => {
    confirmDialog({
      title: `Ask for ${hourLabel(hours).toLowerCase()}?`,
      message: `We'll send a request to ${nannyName} to confirm she can stay. If she accepts, you'll be asked to pay for the extra time before it's added to your booking.`,
      confirmLabel: 'Send request',
      cancelLabel: 'Not now',
      onConfirm: () =>
        requestExtension.mutate(
          { bookingId: booking.id, hours },
          {
            onSuccess: () => onRequested?.(),
            onError: (err) =>
              noticeDialog({ title: 'Could not send the request', message: err.message }),
          },
        ),
    });
  };

  const withdraw = () => {
    const extension = booking.activeExtension;
    if (!extension) return;
    confirmDialog({
      title: 'Withdraw this request?',
      message: `${nannyName} will no longer be asked to stay longer.`,
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep waiting',
      destructive: true,
      onConfirm: () =>
        cancelExtension.mutate(extension.id, {
          onError: (err) => noticeDialog({ title: 'Could not withdraw', message: err.message }),
        }),
    });
  };

  return {
    nannyName,
    end,
    requestHours,
    withdraw,
    isEnding: endBooking.isPending,
    isRequesting: requestExtension.isPending,
    isWithdrawing: cancelExtension.isPending,
  };
}
