import type { Href } from 'expo-router';

import { ApprovalStatus } from '@shared/auth';

/**
 * Where a nanny belongs for her approval status. Nannies are approved by an
 * admin before they can use the app: a missing ID (PENDING_ID) or a rejected
 * application (REJECTED) forces a re-upload, an uploaded one (PENDING_REVIEW)
 * waits, and APPROVED lets her in. Shared by the launch gate and the in-app
 * guard so the two can't disagree.
 */
export function nannyStatusRoute(status: ApprovalStatus | null | undefined): Href {
  switch (status) {
    case ApprovalStatus.APPROVED:
      return '/(nanny)/dashboard';
    case ApprovalStatus.PENDING_ID:
    case ApprovalStatus.REJECTED:
      return '/(auth)/upload-id';
    default:
      return '/(auth)/pending-review';
  }
}
