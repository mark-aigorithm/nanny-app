import { useCallback } from 'react';

import { IdVerificationStatus } from '@shared/nanny';
import { useIdGateStore } from '@mobile/store/idGateStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/**
 * Gate for actions that require a verified identity (mothers, before booking).
 *
 * `gate(action)` returns a handler that opens the ID-upload modal when the
 * signed-in user still needs to (re)upload an ID — status PENDING_ID (never
 * uploaded) or REJECTED (admin cleared it) — and runs `action` otherwise. A
 * mother whose ID is PENDING_REVIEW or APPROVED passes straight through
 * (upload-then-book). Mirrors `useGuestGate`, and composes with it.
 */
export function useIdGate() {
  const profile = useUserProfileStore((s) => s.profile);
  const openIdGate = useIdGateStore((s) => s.openIdGate);

  const status = profile?.idVerificationStatus ?? null;
  const needsId =
    status === IdVerificationStatus.PENDING_ID || status === IdVerificationStatus.REJECTED;
  const reason = profile?.idRejectionReason ?? null;

  const gate = useCallback(
    <Args extends unknown[]>(action: (...args: Args) => void) =>
      (...args: Args) => {
        if (needsId) {
          openIdGate(reason);
          return;
        }
        action(...args);
      },
    [needsId, openIdGate, reason],
  );

  return { needsId, gate };
}
