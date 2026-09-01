import { useCallback } from 'react';

import { useEmailGateStore } from '@mobile/store/emailGateStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/**
 * Gate for actions that require a verified email address (mothers, before
 * booking). A mother registers with a phone-derived placeholder, so booking is
 * the first point where a real address matters: the payment receipt and the
 * Paymob billing record both read it.
 *
 * `gate(action)` returns a handler that opens the verification modal when the
 * signed-in user has no proven address, and runs `action` otherwise. Same
 * signature as `useIdGate`, so the two compose:
 * `emailGate(idGate(doTheThing))`.
 *
 * Falsy-safe on a missing profile: `needsEmail` is only true once we have a
 * profile that says the address is unverified, so a not-yet-loaded profile
 * never blocks a tap.
 */
export function useEmailGate() {
  const profile = useUserProfileStore((s) => s.profile);
  const openEmailGate = useEmailGateStore((s) => s.openEmailGate);

  const needsEmail = profile ? !profile.isEmailVerified : false;

  const gate = useCallback(
    <Args extends unknown[]>(action: (...args: Args) => void) =>
      (...args: Args) => {
        if (needsEmail) {
          openEmailGate();
          return;
        }
        action(...args);
      },
    [needsEmail, openEmailGate],
  );

  return { needsEmail, gate };
}
