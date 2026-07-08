import type { BookingResponse } from '@nanny-app/shared';

const STATUS_LABELS: Record<BookingResponse['status'], string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

/** Human-readable label for a booking status enum value. */
export function formatBookingStatus(status: BookingResponse['status']): string {
  return STATUS_LABELS[status] ?? status;
}
