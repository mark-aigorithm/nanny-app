import type { ApprovalStatus } from '@nanny-app/shared';

/**
 * Badge tone for an approval status. `PENDING_REVIEW` gets the gold `warning`
 * tone so the "needs a decision" state stands out in a queue; `PENDING_ID`
 * (nothing uploaded yet) stays neutral.
 */
export function approvalStatusTone(
  status: ApprovalStatus | null,
): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'PENDING_REVIEW') return 'warning';
  return 'neutral';
}

/** Human-readable label for an approval status, e.g. `PENDING_REVIEW` → "pending review". */
export function approvalStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}
