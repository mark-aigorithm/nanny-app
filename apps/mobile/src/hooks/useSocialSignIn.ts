import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

import { api, getApiErrorMessage } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { auth } from '@mobile/lib/firebase';
import { getSocialCredential, signOutOfGoogle, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
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

function unverifiedEmailError(provider: SocialProvider): MappedAuthError {
  return {
    field: 'form',
    message: `Your ${SOCIAL_PROVIDER_LABEL[provider]} account's email isn't verified. Sign up with your phone number instead.`,
  };
}

/**
 * Leaves the Google/Apple account this attempt signed in to, so a refused
 * sign-in never strands her signed in on an auth screen, and forgets it on the
 * device so the next tap offers the account picker again. Best-effort: the
 * refusal must never fail on this. Signing out also ends any social draft
 * (its account is gone), so the draft goes too.
 */
async function signOutAndForget(): Promise<void> {
  useRegistrationDraftStore.getState().reset();
  try {
    await auth().signOut();
  } catch {
    // Best-effort — see above.
  }
  await signOutOfGoogle();
}

/**
 * "Continue with Google / Apple". Signs in with the provider's credential, then
 * asks the backend whether this uid has an account.
 *
 * A 404 here is a new person, not an orphan: unlike the SMS guards, the
 * Firebase account is kept, because the wizard is about to finish it.
 *
 * Any outcome other than a new person resets the registration draft: a social
 * draft left by an earlier attempt belongs to an account that is no longer the
 * one signed in, and would otherwise keep "Create your account" in its
 * signed-in mode or hand its credential to the next collision.
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
          useRegistrationDraftStore.getState().reset();
          return 'needs-link';
        }
        throw mapFirebaseAuthError(error);
      }

      try {
        await api.get('/auth/me');
        useRegistrationDraftStore.getState().reset();
        return 'signed-in';
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          await signOutAndForget();
          throw {
            field: 'form',
            message: getApiErrorMessage(error, 'Could not sign you in. Please try again.'),
          } satisfies MappedAuthError;
        }
      }

      // The backend checks the address in the Firebase ID token, which is the
      // account's own — so seed that one. The provider profile is only a
      // fallback: Apple shares the address on the first authorization only,
      // but Firebase keeps it on the account either way.
      const user = auth().currentUser;
      const email = user?.email ?? result.profile.email ?? null;
      if (!email) {
        await signOutAndForget();
        throw NO_EMAIL_ERROR;
      }
      // Registration without our own email code rests on Firebase having
      // verified the address. Say so now, not at the wizard's last step.
      if (user?.emailVerified === false) {
        await signOutAndForget();
        throw unverifiedEmailError(provider);
      }

      const draft = useRegistrationDraftStore.getState();
      draft.reset();
      draft.patch({
        role: role ?? null,
        authProvider: provider,
        socialCredential: result.credential,
        socialUid: user?.uid ?? null,
        firstName: result.profile.firstName,
        lastName: result.profile.lastName,
        email: email.trim().toLowerCase(),
      });
      return 'new-user';
    },
  });
}
