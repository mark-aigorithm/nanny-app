import type { NannyBookingDecision } from '@nanny-app/shared';

type Tone = 'success' | 'danger' | 'warning' | 'neutral';

/** Human-readable booking status, e.g. `IN_PROGRESS` → "in progress". */
export function bookingStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

/** Badge tone for a booking status: settled green, dead red, the rest neutral. */
export function bookingStatusTone(status: string): Exclude<Tone, 'warning'> {
  if (status === 'CONFIRMED' || status === 'COMPLETED' || status === 'APPROVED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'danger';
  return 'neutral';
}

/** The nanny's advisory answer to a request. */
export function nannyDecisionLabel(decision: NannyBookingDecision): string {
  if (decision === 'ACCEPTED') return 'Accepted';
  if (decision === 'DECLINED') return 'Declined';
  return 'No response';
}

export function nannyDecisionTone(decision: NannyBookingDecision): Tone {
  if (decision === 'ACCEPTED') return 'success';
  if (decision === 'DECLINED') return 'danger';
  return 'neutral';
}

/**
 * Badge tone for a payment status. A refund is money going back rather than a
 * failure, so it reads as a warning; only a failed charge is red.
 */
export function paymentStatusTone(status: string): Tone {
  if (status === 'CAPTURED' || status === 'AUTHORIZED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'REFUNDED') return 'warning';
  return 'neutral';
}
