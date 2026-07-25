import type { IdVerificationStatus } from '@nanny-app/shared';

/**
 * Badge tone for a KYC verification status. `PENDING_REVIEW` gets the gold
 * `warning` tone so the "needs a decision" state stands out in the review queue;
 * `PENDING_ID` (nothing uploaded yet) stays neutral.
 */
export function idStatusTone(
  status: IdVerificationStatus | null,
): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'PENDING_REVIEW') return 'warning';
  return 'neutral';
}

/** Human-readable label for a KYC status, e.g. `PENDING_REVIEW` → "pending review". */
export function idStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}
