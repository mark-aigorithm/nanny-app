import { useCallback } from 'react';

import { useGuestStore } from '@mobile/store/guestStore';
import { useRegisterPromptStore } from '@mobile/store/registerPromptStore';

/**
 * Gate for account-only interactions while browsing as a guest.
 *
 * `gate(action, message?)` returns a handler that opens the register prompt
 * for guests (with an optional action-specific message) and runs `action`
 * for signed-in users. Wrap `onPress`-style handlers at the call site:
 *
 *   const { gate } = useGuestGate();
 *   <Button onPress={gate(() => createBooking(), 'Create your free account to book care.')} />
 */
export function useGuestGate() {
  const isGuest = useGuestStore((s) => s.isGuest);
  const showRegisterPrompt = useRegisterPromptStore((s) => s.showRegisterPrompt);

  const gate = useCallback(
    <Args extends unknown[]>(action: (...args: Args) => void, message?: string) =>
      (...args: Args) => {
        if (isGuest) {
          showRegisterPrompt(message);
          return;
        }
        action(...args);
      },
    [isGuest, showRegisterPrompt],
  );

  return { isGuest, gate };
}
