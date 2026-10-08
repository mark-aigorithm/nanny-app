import { useMutation } from '@tanstack/react-query';

import { api, getApiErrorMessage, isNotFound } from '@mobile/lib/api';
import { authErrorCode, mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { auth } from '@mobile/lib/firebase';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { seedDraftFromAccount } from '@mobile/lib/resumeSignUp';
import { getSocialCredential, signOutOfGoogle, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { usePendingLinkStore, type PendingLink } from '@mobile/store/pendingLinkStore';
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
 * Completes collision A through the other provider: a Google/Apple credential
 * was parked because its email belongs to an existing account, and the user
 * has now signed in to an existing account with the other one. That sign-in
 * proves they own the account, the parked credential proves they own its
 * identity, so it is linked — the same proof the phone and email doors give.
 */
async function linkParkedCredential(parked: PendingLink | null): Promise<void> {
  if (!parked) return;
  usePendingLinkStore.getState().set(parked);
  await linkPendingCredential();
}

/**
 * "Continue with Google / Apple". Signs in with the provider's credential, then
 * asks the backend whether this uid has an account.
 *
 * A 404 here is a new person, not an orphan: unlike the SMS guards, the
 * Firebase account is kept, because the wizard is about to finish it.
 *
 * A credential parked by collision A for the *other* provider is linked when
 * this sign-in reaches an existing account (see linkParkedCredential); a
 * brand-new account is someone else's identity, so it is dropped there.
 *
 * Any outcome other than a new person resets the registration draft: a social
 * draft left by an earlier attempt belongs to an account that is no longer the
 * one signed in, and would otherwise keep "Create your account" in its
 * signed-in mode or hand its credential to the next collision.
 */
export function useSocialSignIn() {
  return useMutation<SocialSignInOutcome, MappedAuthError, { provider: SocialProvider; role?: Role }>({
    mutationFn: async ({ provider, role }) => {
      // Taken off the store before anything else, so a cancelled or failed
      // attempt leaves nothing parked. The same provider again is a retry of
      // the collision, not a way to prove the account.
      const pending = usePendingLinkStore.getState().pending;
      const parked = pending && pending.provider !== provider ? pending : null;
      usePendingLinkStore.getState().clear();

      const result = await getSocialCredential(provider);
      if (!result) return 'cancelled';

      let isNewUser: boolean;
      try {
        const signedIn = await auth().signInWithCredential(result.credential);
        isNewUser = signedIn.additionalUserInfo?.isNewUser ?? true;
      } catch (error) {
        if (authErrorCode(error) === 'auth/account-exists-with-different-credential') {
          usePendingLinkStore.getState().set({ provider, credential: result.credential, phoneHint: null });
          useRegistrationDraftStore.getState().reset();
          return 'needs-link';
        }
        throw mapFirebaseAuthError(error);
      }

      try {
        await api.get('/auth/me');
        useRegistrationDraftStore.getState().reset();
        await linkParkedCredential(parked);
        return 'signed-in';
      } catch (error) {
        if (!isNotFound(error)) {
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
      if (!user) {
        // signInWithCredential resolved, so this is only a sign-out racing it.
        await signOutAndForget();
        throw { field: 'form', message: 'Could not sign you in. Please try again.' } satisfies MappedAuthError;
      }
      const email = user.email ?? result.profile.email ?? null;
      if (!email) {
        await signOutAndForget();
        throw NO_EMAIL_ERROR;
      }
      // Registration without our own email code rests on Firebase having
      // verified the address. Say so now, not at the wizard's last step.
      if (!user.emailVerified) {
        await signOutAndForget();
        throw unverifiedEmailError(provider);
      }

      // An account that existed before this sign-in, with no row: a sign-up
      // that stalled. Signing in to it still proves it is hers.
      if (!isNewUser) await linkParkedCredential(parked);

      // The account itself seeds the draft (its uid, and a phone already
      // linked to it), then what this sign-in adds goes on top.
      seedDraftFromAccount(user, { isResume: false });
      const seeded = useRegistrationDraftStore.getState();
      seeded.patch({
        role: role ?? null,
        authProvider: provider,
        socialCredential: result.credential,
        firstName: result.profile.firstName || seeded.firstName,
        lastName: result.profile.lastName || seeded.lastName,
        email: email.trim().toLowerCase(),
      });
      return 'new-user';
    },
  });
}
