import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import type {
  AvailabilityResponse,
  CheckAvailabilityRequest,
  RegisterRequest,
  SetVerifiedEmailRequest,
  SetVerifiedEmailResponse,
  UserResponse,
  VerifyEmailOtpRequest,
  VerifyEmailOtpResponse,
} from '@nanny-app/shared';

import { auth } from '@mobile/lib/firebase';
import type { FirebaseUser, PhoneConfirmation, UserCredential } from '@mobile/lib/firebase';
import { api, getApiErrorMessage, unwrap } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { clearLocalSession } from '@mobile/lib/session';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/** Thrown whenever a phone number turns out to have no account behind it. */
const NO_ACCOUNT_FOR_PHONE_ERROR: MappedAuthError = {
  field: 'phone',
  message: "We couldn't find an account for that number. Sign up first.",
};

/**
 * Discards the account Firebase just minted for a number that turned out to
 * have no application account behind it — but only when a phone number is all
 * it holds. Anything more (a password, Google, Apple) is a real sign-up that
 * stalled before its row was written; deleting it would take the user's
 * Google or Apple identity with it, so sign out instead and let them resume.
 * Best-effort: if the delete itself fails we must still not leave the app
 * signed in as an account nothing recognizes, so fall back to signing out — a
 * retry re-confirms into the same uid either way.
 */
async function discardPhoneOnlyAccount(user: FirebaseUser): Promise<void> {
  const phoneOnly =
    user.providerData.length > 0 &&
    user.providerData.every((provider) => provider.providerId === 'phone');
  if (phoneOnly) {
    try {
      await user.delete();
      return;
    } catch {
      // Fall through to signing out.
    }
  }
  await auth().signOut().catch(() => undefined);
}

/**
 * Signs in with the email/password credential. The secondary door.
 *
 * Also completes a Google/Apple collision, if one brought her here — but only
 * once `/auth/me` says the account has a row, as the SMS door requires. A
 * password is not proof on its own: a phone wizard abandoned after its
 * password step leaves a row-less account that signs in fine, and linking
 * Google onto that would hand the identity to an account nothing recognizes.
 * Any other answer drops the parked credential unlinked; the sign-in itself
 * still resolves, and the root router signs a row-less account out, as it
 * always has.
 */
export function useSignInWithEmail() {
  return useMutation<
    UserCredential,
    MappedAuthError,
    { email: string; password: string }
  >({
    mutationFn: async ({ email, password }) => {
      let credential: UserCredential;
      try {
        credential = await auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
      // Whatever social sign-up was under way belonged to another session.
      useRegistrationDraftStore.getState().reset();

      let accountExists = false;
      try {
        await api.get('/auth/me');
        accountExists = true;
      } catch {
        // No row, or no answer — either way, no proof.
      }
      if (accountExists) await linkPendingCredential();
      else usePendingLinkStore.getState().clear();
      return credential;
    },
  });
}

/**
 * Finishes the default door: check the SMS code, then make sure the number
 * actually belongs to an account.
 *
 * Confirming a code *is* a sign-in, so Firebase mints a phone-only account for
 * a number it has never seen — invisible to the email door and unusable by
 * "reset password", which is how an account once looked deleted while its row
 * survived. A 404 from /auth/me is that case: delete what we just created and
 * say so, rather than leaving a stray uid squatting on the number.
 */
export function useConfirmPhoneSignIn() {
  return useMutation<void, MappedAuthError, { confirmation: PhoneConfirmation; code: string }>({
    mutationFn: async ({ confirmation, code }) => {
      try {
        await confirmation.confirm(code);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }

      const user = auth().currentUser;
      if (!user) {
        throw {
          field: 'form',
          message: 'Your code was verified but the session was lost. Please try again.',
        } satisfies MappedAuthError;
      }

      try {
        await api.get('/auth/me');
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // Best-effort cleanup. If the delete itself fails we must still not
          // leave her signed in as an account the backend does not know — sign
          // out instead, and let registration re-confirm into the same uid.
          await discardPhoneOnlyAccount(user);
          throw NO_ACCOUNT_FOR_PHONE_ERROR;
        }
        throw {
          field: 'form',
          message: getApiErrorMessage(error, 'Could not sign you in. Please try again.'),
        } satisfies MappedAuthError;
      }

      // Whatever social sign-up was under way belonged to another session.
      // A parked collision credential lives in pendingLinkStore, not the
      // draft, so the caller can still link it.
      useRegistrationDraftStore.getState().reset();
    },
  });
}

/**
 * Resets the password for a phone-only account. Phone is the sign-in identity,
 * so recovery is by SMS rather than email: confirming the code signs the user
 * in as the phone uid, then `updatePassword` sets a new password on the linked
 * email/password credential that `SignInScreen` checks. Because confirming the
 * code is itself a fresh sign-in, `updatePassword` never trips
 * `auth/requires-recent-login`.
 *
 * Confirming a code *is* a sign-in, though, so a number with no account gets
 * the same treatment as `useConfirmPhoneSignIn`'s 404: Firebase mints a fresh
 * phone-only user (no email) rather than landing on a real one. Writing a
 * password onto that user would "succeed" against a credential nothing can
 * sign in with, so it is discarded instead, guarded on `user.email` alone —
 * no backend round trip needed, since a phone-only account never has one.
 */
export function useConfirmPhoneAndResetPassword() {
  return useMutation<
    void,
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; newPassword: string }
  >({
    mutationFn: async ({ confirmation, code, newPassword }) => {
      try {
        await confirmation.confirm(code);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }

      const user = auth().currentUser;
      if (!user) {
        // confirm() resolved without leaving a session — nothing to update.
        throw {
          field: 'form',
          message: 'Your code was verified but the session was lost. Please try again.',
        } satisfies MappedAuthError;
      }

      if (!user.email) {
        await discardPhoneOnlyAccount(user);
        throw NO_ACCOUNT_FOR_PHONE_ERROR;
      }

      try {
        await user.updatePassword(newPassword);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}

/**
 * Signs out. Everything local goes through `clearLocalSession`, so this and
 * every other exit leave the same things behind.
 */
export function useSignOut() {
  return useMutation<void, MappedAuthError, void>({
    mutationFn: async () => {
      try {
        await clearLocalSession();
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}

/**
 * "Use a different sign-up method" / leaving an unfinished sign-up. Asks the
 * server to delete the account (it refuses unless no row points at it), then
 * signs out locally whatever happened — leaving must never fail, and a
 * leftover the server kept is resumed next time instead.
 */
export function useDiscardUnfinishedAccount() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      try {
        await api.delete('/auth/me');
      } catch {
        // Best-effort — see above.
      }
      await clearLocalSession().catch(() => undefined);
    },
  });
}

/**
 * Sends the registration SMS and hands back the handle the code is checked
 * against. `forceResend` marks a user-tapped resend rather than the first send.
 */
export function useSendPhoneOtp() {
  return useMutation<
    PhoneConfirmation,
    MappedAuthError,
    { phone: string; forceResend?: boolean }
  >({
    mutationFn: async ({ phone, forceResend }) => {
      try {
        return await auth().signInWithPhoneNumber(phone, forceResend);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}

/**
 * Finishes the auth half of registration: checks the SMS code, then attaches
 * the email/password credential to the user Firebase just signed in.
 *
 * Confirming the code *is* a sign-in — it leaves the app authenticated as a
 * phone-only user with no password. Linking gives that same uid the
 * email/password credential `SignInScreen` expects, so the verified phone
 * becomes an additional factor on one account rather than a second account.
 *
 * The address passed here is the real one, already proved by our own email
 * OTP on step 2 of the wizard. It becomes both this credential (so
 * `EmailSignInScreen` has something to check, and so Firebase's own
 * password-reset mail can reach her) and, via `POST /auth/register`,
 * `users.email` — one proven address, not a placeholder plus a real one.
 *
 * Idempotent: a retry after a failure further down the wizard re-confirms into
 * the same uid, where the password provider is already attached.
 */
export function useConfirmPhoneAndLink() {
  return useMutation<
    void,
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; email: string; password: string }
  >({
    mutationFn: async ({ confirmation, code, email, password }) => {
      try {
        await confirmation.confirm(code);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }

      const user = auth().currentUser;
      if (!user) {
        // confirm() resolved without leaving a session — nothing to link onto.
        throw {
          field: 'form',
          message: 'Your phone was verified but the session was lost. Please try again.',
        } satisfies MappedAuthError;
      }

      const credential = auth.EmailAuthProvider.credential(email.trim().toLowerCase(), password);

      try {
        await user.linkWithCredential(credential);
      } catch (error) {
        // A password provider already on *this* uid used to be a safe no-op,
        // because the credential was derived from the phone — any two link
        // attempts for the same number were identical. Now that it's the
        // user's own chosen email and password, that's no longer true: a
        // wizard abandoned after this step and restarted with a different
        // email or password confirms into the same uid, where the link call
        // is a no-op that would otherwise silently leave Firebase on the
        // abandoned attempt's email/password while the DB row gets the new
        // one. `updateEmail` can't fix this up afterward — it's blocked
        // under email-enumeration protection — so unlink the stale
        // credential and link the new one in its place. The "already in
        // use" codes mean a different account owns that address, which the
        // user has to resolve — let those surface, same as before.
        if ((error as { code?: string })?.code !== 'auth/provider-already-linked') {
          throw mapFirebaseAuthError(error);
        }
        try {
          await user.unlink('password');
          await user.linkWithCredential(credential);
        } catch (relinkError) {
          throw mapFirebaseAuthError(relinkError);
        }
      }

      // /auth/register comes next and checks that the token's email is the
      // address just verified; force the refresh so it can't carry the claims
      // from before the link.
      await user.getIdToken(true);
    },
  });
}

/**
 * A code sent to link a phone onto the account that is already signed in —
 * the Google/Apple wizard's step 3. On Android, Firebase can read the SMS
 * itself (`autoVerified` with the `code` filled in) or skip it entirely on an
 * instant verification (`autoVerified` with no code), in which case the
 * native side holds the credential.
 */
export type PhoneLinkChallenge = {
  verificationId: string | null;
  autoVerified: boolean;
  code: string | null;
};

const PHONE_TAKEN_ERROR: MappedAuthError = {
  field: 'phone',
  message: 'This phone number already has an account.',
  code: 'auth/credential-already-in-use',
};

/**
 * Sends the SMS for linking, not for signing in: `verifyPhoneNumber` leaves
 * the signed-in Google/Apple account alone, where `signInWithPhoneNumber`
 * would replace it.
 *
 * Resolves on the first usable event. The listener's own promise is not used:
 * on Android it waits out the whole auto-retrieval timeout before settling.
 */
export function useSendPhoneLinkCode() {
  return useMutation<PhoneLinkChallenge, MappedAuthError, { phone: string; forceResend?: boolean }>({
    mutationFn: ({ phone, forceResend }) =>
      new Promise<PhoneLinkChallenge>((resolve, reject) => {
        auth()
          .verifyPhoneNumber(phone, forceResend ?? false)
          .on(
            'state_changed',
            (snapshot) => {
              if (snapshot.state === 'sent' || snapshot.state === 'timeout') {
                resolve({ verificationId: snapshot.verificationId, autoVerified: false, code: null });
              } else if (snapshot.state === 'verified') {
                resolve({ verificationId: snapshot.verificationId, autoVerified: true, code: snapshot.code });
              } else if (snapshot.state === 'error') {
                reject(mapFirebaseAuthError(snapshot.error));
              }
            },
            (error) => reject(mapFirebaseAuthError(error)),
          );
      }),
  });
}

/**
 * Links the verified phone onto the signed-in Google/Apple account, so SMS
 * sign-in and SMS reset reach the same uid. Then refreshes the ID token so
 * `/auth/register` sees `phone_number` and marks the phone verified.
 *
 * A number that already belongs to another account rejects with
 * `code: 'auth/credential-already-in-use'` — the caller's cue for collision B.
 *
 * Idempotent across retries, decided from the account *before* the credential
 * is touched: the same number already linked is done; a different one left by
 * an abandoned attempt is unlinked first; then the credential is linked once.
 * It can only be used once. After an Android instant verification the native
 * side hands out its cached credential for a single link and then forgets it,
 * so linking, failing and linking again would always be refused. A
 * `provider-already-linked` from that single link is therefore unexpected, and
 * is mapped like any other failure.
 *
 * `signUpUid` is the draft's record of the account this sign-up
 * created. Anyone else signed in — say, a registered account that has signed
 * in on this device since — is refused before anything is touched: the
 * unlink above would otherwise strip that account's own phone.
 */
export function useLinkPhoneToCurrentUser() {
  return useMutation<
    void,
    MappedAuthError,
    { challenge: PhoneLinkChallenge; code: string; phone: string; signUpUid: string | null }
  >({
    mutationFn: async ({ challenge, code, phone, signUpUid }) => {
      const user = auth().currentUser;
      if (!user || !signUpUid || user.uid !== signUpUid) {
        throw {
          field: 'form',
          message: 'Your session ended. Please continue with Google or Apple again.',
        } satisfies MappedAuthError;
      }

      // A retry after a later step failed: the number is already on the
      // account, and re-linking would spend a credential for nothing.
      if (user.phoneNumber !== phone) {
        try {
          if (user.phoneNumber) await user.unlink('phone');
          const credential =
            challenge.autoVerified && !challenge.code
              ? auth.PhoneAuthProvider.credential(null)
              : auth.PhoneAuthProvider.credential(challenge.verificationId, challenge.code ?? code);
          await user.linkWithCredential(credential);
        } catch (error) {
          throw (error as { code?: unknown })?.code === 'auth/credential-already-in-use'
            ? PHONE_TAKEN_ERROR
            : mapFirebaseAuthError(error);
        }
      }

      await user.getIdToken(true);
    },
  });
}

/**
 * Calls the backend `POST /auth/register` to create the application User
 * row for the freshly-signed-up Firebase user. Run after the phone link
 * succeeds, when `auth().currentUser` is fully populated. The endpoint is
 * idempotent — safe to retry on transient failures.
 */
export function useRegisterProfile() {
  const setProfile = useUserProfileStore((s) => s.setProfile);
  return useMutation<UserResponse, Error, RegisterRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/register', body)),
    onSuccess: (profile) => setProfile(profile),
  });
}

/**
 * Asks whether an email and phone already belong to an account. Step 1 of the
 * wizard calls this on Continue so a collision is shown under the field, not
 * on the code screen after it or at the very end of the wizard. Signed-out,
 * like the OTP send: the caller has no account yet.
 */
export function useCheckAvailability() {
  return useMutation<AvailabilityResponse, Error, CheckAvailabilityRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/availability', body)),
  });
}

/**
 * Mails a one-time code to an address. Used by both entry points — the nanny
 * registration step and the mother's pre-booking gate — and works signed-out,
 * because a nanny verifies before her Firebase account exists.
 */
export function useSendEmailOtp() {
  return useMutation<void, Error, string>({
    mutationFn: async (email) => {
      await api.post('/auth/email/otp', { email });
    },
  });
}

/**
 * Checks a code and returns the single-use token proving the address. Nothing
 * is marked verified by this call — the token still has to be spent, on
 * `/auth/register` (nanny) or `/auth/email` (mother).
 */
export function useVerifyEmailOtp() {
  return useMutation<VerifyEmailOtpResponse, Error, VerifyEmailOtpRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/email/verify', body)),
  });
}

/**
 * Spends a verification token to attach the address to the signed-in user.
 * The mother's half of the gate; see `useVerifiedEmailSubmit`, which owns the
 * ordering against the matching Firebase credential update.
 *
 * The response sometimes also carries a fresh Firebase custom token: moving
 * the account's Firebase email revokes the caller's own session, so
 * `useVerifiedEmailSubmit` trades this token in via `signInWithCustomToken`
 * right after. It is a one-time credential, not profile data, so it is
 * stripped before the response is written into the profile store.
 */
export function useSetVerifiedEmail() {
  const setProfile = useUserProfileStore((s) => s.setProfile);
  return useMutation<SetVerifiedEmailResponse, Error, SetVerifiedEmailRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/email', body)),
    onSuccess: ({ customToken, ...profile }) => setProfile(profile),
  });
}

/**
 * Asks Firebase to mail its own reset link to `email`.
 *
 * Email-enumeration protection means an unknown address resolves exactly like
 * a known one, so the screen must never report delivery — the copy says "if an
 * account exists". `auth/invalid-email` is the one real error left.
 */
export function useSendPasswordResetEmail() {
  return useMutation<void, MappedAuthError, string>({
    mutationFn: async (email) => {
      try {
        await auth().sendPasswordResetEmail(email.trim().toLowerCase());
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}

