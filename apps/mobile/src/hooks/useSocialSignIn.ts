import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

import { api, getApiErrorMessage } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { auth } from '@mobile/lib/firebase';
import { getSocialCredential } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import type { Role, SocialProvider } from '@mobile/types';

/**
 * - `cancelled`: the user closed the sheet.
 * - `signed-in`: an existing account — the root router takes over.
 * - `new-user`: a new person; the social draft is seeded, so go to the wizard.
 * - `needs-link`: the email belongs to an account with another sign-in method;
 *   the credential is parked, so go to sign-in (collision A).
 */
export type SocialSignInOutcome = 'cancelled' | 'signed-in' | 'new-user' | 'needs-link';

const NO_EMAIL_ERROR: MappedAuthError = {
  field: 'form',
  message:
    "Your account didn't share an email address, which we need for receipts. Sign up with your phone number instead.",
};

/**
 * "Continue with Google / Apple". Signs in with the provider's credential, then
 * asks the backend whether this uid has an account.
 *
 * A 404 here is a new person, not an orphan: unlike the SMS guards, the
 * Firebase account is kept, because the wizard is about to finish it.
 */
export function useSocialSignIn() {
  return useMutation<SocialSignInOutcome, MappedAuthError, { provider: SocialProvider; role?: Role }>({
    mutationFn: async ({ provider, role }) => {
      usePendingLinkStore.getState().clear();

      const result = await getSocialCredential(provider);
      if (!result) return 'cancelled';

      try {
        await auth().signInWithCredential(result.credential);
      } catch (error) {
        if ((error as { code?: unknown })?.code === 'auth/account-exists-with-different-credential') {
          usePendingLinkStore.getState().set({ provider, credential: result.credential, phoneHint: null });
          return 'needs-link';
        }
        throw mapFirebaseAuthError(error);
      }

      try {
        await api.get('/auth/me');
        return 'signed-in';
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          throw {
            field: 'form',
            message: getApiErrorMessage(error, 'Could not sign you in. Please try again.'),
          } satisfies MappedAuthError;
        }
      }

      // Apple returns the address only on the first authorization; Firebase
      // kept it on the account, so read it back from there on later attempts.
      const email = result.profile.email ?? auth().currentUser?.email ?? null;
      if (!email) {
        try {
          await auth().signOut();
        } catch {
          // Best-effort: refusing the sign-up must never fail on this.
        }
        throw NO_EMAIL_ERROR;
      }

      const draft = useRegistrationDraftStore.getState();
      draft.reset();
      draft.patch({
        role: role ?? null,
        authProvider: provider,
        socialCredential: result.credential,
        firstName: result.profile.firstName,
        lastName: result.profile.lastName,
        email: email.trim().toLowerCase(),
      });
      return 'new-user';
    },
  });
}
