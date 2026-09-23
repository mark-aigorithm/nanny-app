import { create } from 'zustand';

import type { AuthCredential } from '@mobile/lib/firebase';
import type { SocialProvider } from '@mobile/types';

export type PendingLink = {
  provider: SocialProvider;
  credential: AuthCredential;
  /** The E.164 number typed before the collision, to prefill sign-in. */
  phoneHint: string | null;
};

type PendingLinkState = {
  pending: PendingLink | null;
  set: (pending: PendingLink) => void;
  clear: () => void;
};

/**
 * A Google/Apple credential waiting to be linked onto an account the user is
 * about to prove they own — by SMS code or password (see lib/pendingLink.ts).
 *
 * In memory only: the credential is a live ID token. And whatever this holds
 * is linked on the next successful sign-in, so only a real collision may put
 * a credential here, and it is cleared eagerly — after any link attempt, when
 * a new social attempt starts, on "Not now", and on sign-out.
 */
export const usePendingLinkStore = create<PendingLinkState>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
