/**
 * The line under "Cancel this booking?".
 *
 * The window comes from `/bookings/options` (`cancellationWindowHours`), which
 * is the same setting the server charges by — so the fee the parent is warned
 * about is the fee she pays. Before the options have loaded the platform
 * default (24 h) is shown rather than nothing, since the dialog can open first.
 */
const DEFAULT_WINDOW_HOURS = 24;

export function cancellationWarning(windowHours: number | undefined): string {
  const hours = windowHours ?? DEFAULT_WINDOW_HOURS;
  if (hours <= 0) return 'Cancelling is free — no fee applies.';
  const unit = hours === 1 ? 'hour' : 'hours';
  return `Cancellations within ${hours} ${unit} of the booking are subject to a 50% fee.`;
}
