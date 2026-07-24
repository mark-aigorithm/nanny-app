import type { BookingResponse, PaymentMethod, PaymentStatus } from '@nanny-app/shared';

const STATUS_LABELS: Record<BookingResponse['status'], string> = {
  PENDING: 'Awaiting approval',
  APPROVED: 'Approved · Payment due',
  // Legacy status kept for older rows created before pay-after-approval.
  PENDING_CONFIRMATION: 'Awaiting Confirmation',
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

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Card',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  WALLET: 'Wallet',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Awaiting payment',
  AUTHORIZED: 'Authorised',
  CAPTURED: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

/** Human-readable label for a payment method — never show the raw enum. */
export function formatPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/** Human-readable label for a payment status. */
export function formatPaymentStatus(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}
