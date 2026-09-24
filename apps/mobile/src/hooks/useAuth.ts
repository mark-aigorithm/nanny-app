import { Platform } from 'react-native';
import { useMutation } from '@tanstack/react-query';
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
import type { AuthCredential, FirebaseUser, PhoneConfirmation, UserCredential } from '@mobile/lib/firebase';
import { api, apiStatusOf, getApiErrorMessage, isNotFound, unwrap } from '@mobile/lib/api';
import { COULD_NOT_CONNECT, mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { clearLocalSession } from '@mobile/lib/session';
import { getAppleAuthorizationCode } from '@mobile/lib/socialAuth';
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

type AccountCheck = 'exists' | 'unfinished' | 'phone-only-new';

/**
 * Asks `/auth/me` about the account just signed in.
 *
 * - `exists`: it has a row.
 * - `unfinished`: no row, but it holds more than a phone (a password, Google,
 *   Apple) — a sign-up that stalled before its row was written. The root gate
 *   resumes it.
 * - `phone-only-new`: no row and nothing but a phone — the account Firebase
 *   mints when a code is confirmed for a number it has never seen.
 *
 * Any other answer (offline, 5xx) proves nothing either way, so sign out and
 * say so rather than guess. The draft is reset; a parked collision credential
 * is kept, so the next attempt can still link it.
 */
async function checkAccount(user: FirebaseUser): Promise<AccountCheck> {
  try {
    await api.get('/auth/me');
    return 'exists';
  } catch (error) {
    if (isNotFound(error)) {
      const phoneOnly =
        user.providerData.length > 0 &&
        user.providerData.every((provider) => provider.providerId === 'phone');
      return phoneOnly ? 'phone-only-new' : 'unfinished';
    }
    useRegistrationDraftStore.getState().reset();
    await auth().signOut().catch(() => undefined);
    throw { field: 'form', message: COULD_NOT_CONNECT } satisfies MappedAuthError;
  }
}

/**
 * A code was checked but Firebase left no session behind — a hiccup, so trying
 * again (the code is re-checked) is the way on.
 */
const SESSION_LOST_ERROR: MappedAuthError = {
  field: 'form',
  message: 'Your code was verified but the session was lost. Please try again.',
};

/**
 * The account signed in is not the one this sign-up is finishing (or nobody
 * is): the sign-up can't go on from here, so the only way on is to start
 * again. Step 3 branches on the code and offers "Start again".
 */
export const SESSION_MISMATCH_ERROR: MappedAuthError = {
  field: 'form',
  message: 'Your session ended. Please start again.',
  code: 'session-mismatch',
};

/** The email belongs to an account the server won't give up. */
export const EMAIL_TAKEN_ERROR: MappedAuthError = {
  field: 'form',
  message: 'An account with this email already exists. Sign in instead.',
  code: 'auth/email-already-in-use',
};

/**
 * Checks an SMS code and hands back the account it signed in as.
 *
 * On Android, Firebase can read the SMS and sign in by itself before the code
 * is submitted; the code is then spent, and `confirm` rejects. If the app is
 * already signed in as that very number, that sign-in is the one we wanted.
 */
async function confirmCode(
  confirmation: PhoneConfirmation,
  code: string,
  phone: string,
): Promise<FirebaseUser> {
  try {
    await confirmation.confirm(code);
  } catch (error) {
    if (auth().currentUser?.phoneNumber !== phone) throw mapFirebaseAuthError(error);
  }
  const user = auth().currentUser;
  if (!user) throw SESSION_LOST_ERROR;
  return user;
}

/**
 * Signs in with the email/password credential. The secondary door.
 *
 * Also completes a Google/Apple collision, if one brought her here — once
 * `/auth/me` answers. A row (`exists`) is the plain case. No row
 * (`unfinished`) is a sign-up that stalled after its password step: the
 * password has just proved it is hers, and the root gate resumes it, so the
 * parked credential links onto it too. Any other answer signs out with
 * `COULD_NOT_CONNECT` and keeps the parked credential for another try.
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

      // `phone-only-new` cannot happen here — the account has a password — so
      // every outcome that returns is `exists` or `unfinished`.
      await checkAccount(credential.user);
      await linkPendingCredential();
      return credential;
    },
  });
}

/**
 * Finishes the default door: check the SMS code, then ask what the number
 * belongs to.
 *
 * Confirming a code *is* a sign-in, so Firebase mints a phone-only account for
 * a number it has never seen — invisible to the email door and unusable by
 * "reset password". That one is deleted, and she is told to sign up. A number
 * on an account that holds more (a password, Google, Apple) but has no row is
 * an unfinished sign-up: `'needs-setup'`, which the root gate resumes.
 *
 * `phone` is the E.164 number the code was sent to.
 */
export function useConfirmPhoneSignIn() {
  return useMutation<
    'signed-in' | 'needs-setup',
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; phone: string }
  >({
    mutationFn: async ({ confirmation, code, phone }) => {
      const user = await confirmCode(confirmation, code, phone);

      const account = await checkAccount(user);
      if (account === 'phone-only-new') {
        await discardPhoneOnlyAccount(user);
        throw NO_ACCOUNT_FOR_PHONE_ERROR;
      }

      // Whatever social sign-up was under way belonged to another session —
      // for a leftover, the root gate seeds a fresh draft from the account.
      // A parked collision credential lives in pendingLinkStore, not the
      // draft, so the caller can still link it.
      useRegistrationDraftStore.getState().reset();
      return account === 'exists' ? 'signed-in' : 'needs-setup';
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
 * Confirming a code *is* a sign-in, though, so the account is checked first,
 * as `useConfirmPhoneSignIn` does. A phone-only account Firebase just minted
 * is discarded. An unfinished sign-up (`'needs-setup'`) is left alone — its
 * password is the one she chose moments ago in the wizard, and the root gate
 * resumes it. An account with a row but no email on file has no password to
 * reset and gets the same treatment as the phone-only one.
 */
export function useConfirmPhoneAndResetPassword() {
  return useMutation<
    'password-updated' | 'needs-setup',
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; phone: string; newPassword: string }
  >({
    mutationFn: async ({ confirmation, code, phone, newPassword }) => {
      const user = await confirmCode(confirmation, code, phone);

      const account = await checkAccount(user);
      if (account === 'unfinished') return 'needs-setup';
      if (account === 'phone-only-new' || !user.email) {
        await discardPhoneOnlyAccount(user);
        throw NO_ACCOUNT_FOR_PHONE_ERROR;
      }

      try {
        await user.updatePassword(newPassword);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
      return 'password-updated';
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

/** Revoking the Apple ID failed, so the account is kept (Apple's rule). */
const APPLE_REVOKE_FAILED_ERROR: MappedAuthError = {
  field: 'form',
  message: "We couldn't disconnect your Apple ID. Please try again.",
};

/**
 * Deletes the signed-in account. On iOS an Apple sign-in is revoked first
 * (Apple's rule for account deletion). Android has no way to revoke, so it
 * deletes anyway and the server logs it. The server does the deleting and
 * refuses (409) while a booking is active. Signing out afterwards can't fail
 * the deletion: the account is already gone.
 */
export function useDeleteAccount() {
  return useMutation<'deleted' | 'cancelled', MappedAuthError, void>({
    mutationFn: async () => {
      const user = auth().currentUser;
      if (!user) throw SESSION_LOST_ERROR;
      const appleLinked = user.providerData.some((p) => p.providerId === 'apple.com');
      let appleRevoked = false;
      if (appleLinked && Platform.OS === 'ios') {
        const code = await getAppleAuthorizationCode();
        if (!code) return 'cancelled';
        try {
          await auth().revokeToken(code);
        } catch {
          throw APPLE_REVOKE_FAILED_ERROR;
        }
        appleRevoked = true;
      }
      try {
        await api.delete('/auth/me', { data: { confirm: 'delete-my-account', appleRevoked } });
      } catch (err) {
        const status = apiStatusOf(err);
        throw {
          field: 'form',
          message: status === 409 || status === 403 ? getApiErrorMessage(err) : COULD_NOT_CONNECT,
        } satisfies MappedAuthError;
      }
      await clearLocalSession().catch(() => undefined);
      return 'deleted';
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
 * Links the email/password credential onto `user`. A password provider
 * already on this uid is swapped for the new one.
 *
 * It used to be a safe no-op, because the credential was derived from the
 * phone — any two link attempts for the same number were identical. Now that
 * it's the user's own chosen email and password, that's no longer true: a
 * wizard abandoned after this step and restarted with a different email or
 * password confirms into the same uid, where the link call is a no-op that
 * would otherwise silently leave Firebase on the abandoned attempt's
 * email/password while the DB row gets the new one. `updateEmail` can't fix
 * this up afterward — it's blocked under email-enumeration protection — so
 * unlink the stale credential and link the new one in its place.
 *
 * Rejects with the raw Firebase error; the caller maps it.
 */
async function linkEmailPassword(user: FirebaseUser, credential: AuthCredential): Promise<void> {
  try {
    await user.linkWithCredential(credential);
  } catch (error) {
    if ((error as { code?: unknown })?.code !== 'auth/provider-already-linked') throw error;
    await user.unlink('password');
    await user.linkWithCredential(credential);
  }
}

const EMAIL_IN_USE_CODES = new Set(['auth/email-already-in-use', 'auth/credential-already-in-use']);

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
 * Survives retries and resumes:
 * - A retry after a failure further down the wizard re-uses a spent code;
 *   `confirmCode` accepts that when the app is already signed in as `phone`.
 * - `confirmation: null` is a resumed sign-up whose account already holds
 *   `phone` — nothing to confirm. Any other signed-in account (or none) is
 *   `SESSION_MISMATCH_ERROR`.
 * - An empty `password` means create-password was skipped because the
 *   account already has a password for this email; the link is skipped too.
 * - An email another unfinished account is squatting (`email-already-in-use`
 *   / `credential-already-in-use`) is reclaimed with `emailVerificationToken`,
 *   then linked once more. A refused reclaim, or no token to reclaim with, is
 *   `EMAIL_TAKEN_ERROR`.
 */
export function useConfirmPhoneAndLink() {
  return useMutation<
    void,
    MappedAuthError,
    {
      confirmation: PhoneConfirmation | null;
      code: string;
      phone: string;
      email: string;
      password: string;
      emailVerificationToken: string | null;
    }
  >({
    mutationFn: async ({ confirmation, code, phone, email, password, emailVerificationToken }) => {
      let user: FirebaseUser;
      if (confirmation) {
        user = await confirmCode(confirmation, code, phone);
      } else {
        const current = auth().currentUser;
        if (!current || current.phoneNumber !== phone) throw SESSION_MISMATCH_ERROR;
        user = current;
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!password) {
        const hasSamePassword = user.providerData.some(
          (p) => p.providerId === 'password' && p.email?.toLowerCase() === normalizedEmail,
        );
        if (!hasSamePassword) {
          throw { field: 'form', message: 'Please go back and create a password.' } satisfies MappedAuthError;
        }
      } else {
        const credential = auth.EmailAuthProvider.credential(normalizedEmail, password);
        try {
          await linkEmailPassword(user, credential);
        } catch (error) {
          const errorCode = (error as { code?: unknown })?.code;
          if (typeof errorCode !== 'string' || !EMAIL_IN_USE_CODES.has(errorCode)) {
            throw mapFirebaseAuthError(error);
          }
          if (!emailVerificationToken) throw EMAIL_TAKEN_ERROR;
          try {
            await api.post('/auth/reclaim-email', { email: normalizedEmail, emailVerificationToken });
          } catch (reclaimError) {
            throw apiStatusOf(reclaimError) === 409
              ? EMAIL_TAKEN_ERROR
              : ({ field: 'form', message: COULD_NOT_CONNECT } satisfies MappedAuthError);
          }
          try {
            await linkEmailPassword(user, credential);
          } catch (relinkError) {
            throw mapFirebaseAuthError(relinkError);
          }
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
 * `challenge: null` is a resumed sign-up whose account already holds `phone`:
 * nothing is linked. If it doesn't hold it, `SESSION_MISMATCH_ERROR`.
 *
 * `signUpUid` is the draft's record of the account this sign-up
 * created. Anyone else signed in — say, a registered account that has signed
 * in on this device since — is refused (`SESSION_MISMATCH_ERROR`) before
 * anything is touched: the unlink above would otherwise strip that account's
 * own phone.
 */
export function useLinkPhoneToCurrentUser() {
  return useMutation<
    void,
    MappedAuthError,
    { challenge: PhoneLinkChallenge | null; code: string; phone: string; signUpUid: string | null }
  >({
    mutationFn: async ({ challenge, code, phone, signUpUid }) => {
      const user = auth().currentUser;
      if (!user || !signUpUid || user.uid !== signUpUid) throw SESSION_MISMATCH_ERROR;

      // No challenge: a resumed sign-up whose account already holds the
      // number, so no SMS was sent. Anything else means the account moved on.
      if (!challenge && user.phoneNumber !== phone) throw SESSION_MISMATCH_ERROR;

      // A retry after a later step failed: the number is already on the
      // account, and re-linking would spend a credential for nothing.
      if (challenge && user.phoneNumber !== phone) {
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

