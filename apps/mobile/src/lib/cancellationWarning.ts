import type { BookingOptions } from '@nanny-app/shared';

/**
 * The line under "Cancel this booking?".
 *
 * Both numbers come from `/bookings/options` (`cancellationWindowHours`,
 * `cancellationFeePercent`) — the same settings the server uses for its
 * suggested refund — so the fee the parent is warned about is the policy the
 * console set. Before the options have loaded the platform defaults (24 h,
 * 50%) are shown rather than nothing, since the dialog can open first.
 */
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_FEE_PERCENT = 50;

type CancellationPolicy = Pick<BookingOptions, 'cancellationWindowHours' | 'cancellationFeePercent'>;

export function cancellationWarning(policy: Partial<CancellationPolicy> | undefined): string {
  const hours = policy?.cancellationWindowHours ?? DEFAULT_WINDOW_HOURS;
  const fee = policy?.cancellationFeePercent ?? DEFAULT_FEE_PERCENT;
  if (hours <= 0 || fee <= 0) return 'Cancelling is free — no fee applies.';
  const unit = hours === 1 ? 'hour' : 'hours';
  return `Cancellations within ${hours} ${unit} of the booking are subject to a ${fee}% fee.`;
}
