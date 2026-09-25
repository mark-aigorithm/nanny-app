/**
 * Every Firebase-auth mutation the app runs, as React Query hooks.
 *
 * Sections, in order:
 * - Shared errors and helpers — `checkAccount` (what `/auth/me` says about the
 *   account just signed in) and `confirmCode` (checks an SMS code), used by
 *   every door that confirms a code.
 * - Sign-in doors — email/password, and SMS.
 * - Password reset — by SMS, or Firebase's own reset mail.
 * - Leaving — sign out, discard an unfinished sign-up, delete the account.
 * - Registration, phone wizard — confirm the code, link the email/password.
 * - Registration, Google/Apple wizard — link a phone onto the signed-in account.
 * - Registration, backend — availability check and `POST /auth/register`.
 * - Email verification — our own OTP, for both the wizard and the mother's gate.
 *
 * Google/Apple sign-in itself is `useSocialSignIn`; the collision hand-off is
 * `lib/pendingLink`.
 */
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
import {
  authErrorCode,
  COULD_NOT_CONNECT,
  isMappedAuthError,
  mapFirebaseAuthError,
  type MappedAuthError,
} from '@mobile/lib/authErrors';
import { linkPendingCredential } from '@mobile/lib/pendingLink';
import { clearLocalSession } from '@mobile/lib/session';
import { getAppleAuthorizationCode, signOutOfGoogle, SOCIAL_PROVIDER_LABEL } from '@mobile/lib/socialAuth';
import { usePendingLinkStore } from '@mobile/store/pendingLinkStore';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import type { SocialProvider } from '@mobile/types';

// ── Shared errors ────────────────────────────────────────────────────────────

/** Thrown whenever a phone number turns out to have no account behind it. */
const NO_ACCOUNT_FOR_PHONE_ERROR: MappedAuthError = {
  field: 'phone',
  message: "We couldn't find an account for that number. Sign up first.",
};

/**
 * The SMS door discarded a phone-only account, but a Google/Apple credential
 * was parked for this very attempt (collision B sent her here on a phoneHint
 * that turned out to belong to nobody). "Sign up first" would just point her
 * back at the same dead end, so this offers the credential that is actually
 * waiting instead.
 */
function noAccountForPhoneWithParkedCredential(provider: SocialProvider): MappedAuthError {
  return {
    field: 'phone',
    message: `We couldn't find an account for that number. Continue with ${SOCIAL_PROVIDER_LABEL[provider]} to sign up with it.`,
  };
}

/**
 * The backend could not be reached, or answered with something that proves
 * nothing either way (5xx, timeout). Never a reason to guess about the account.
 */
const COULD_NOT_CONNECT_ERROR: MappedAuthError = { field: 'form', message: COULD_NOT_CONNECT };

/** An action that needs a signed-in account found none — nothing to retry. */
const SIGNED_OUT_ERROR: MappedAuthError = {
  field: 'form',
  message: 'Your session ended. Please sign in again.',
};

/**
 * A registered account whose Firebase side has no email (a row the server
 * re-attached to a phone-only Firebase account): a password needs an email
 * to live on, so SMS sign-in is her way in.
 */
const NO_PASSWORD_ON_ACCOUNT_ERROR: MappedAuthError = {
  field: 'form',
  message: "This account can't have a password yet. Sign in with your phone number instead.",
};

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
 * again. Step 3 branches on `code: 'session-mismatch'` and offers "Start again".
 */
const SESSION_MISMATCH_ERROR: MappedAuthError = {
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
 * The phone belongs to another account. Step 3 of the Google/Apple wizard
 * branches on the code to start collision B.
 */
const PHONE_TAKEN_ERROR: MappedAuthError = {
  field: 'phone',
  message: 'This phone number already has an account.',
  code: 'auth/credential-already-in-use',
};

/** Revoking the Apple ID failed, so the account is kept (Apple's rule). */
const APPLE_REVOKE_FAILED_ERROR: MappedAuthError = {
  field: 'form',
  message: "We couldn't disconnect your Apple ID. Please try again.",
};

// ── Shared helpers ───────────────────────────────────────────────────────────

/** True when a phone number is the only sign-in method on the account. */
function isPhoneOnly(user: FirebaseUser): boolean {
  return (
    user.providerData.length > 0 &&
    user.providerData.every((provider) => provider.providerId === 'phone')
  );
}

/**
 * Discards the phone-only account Firebase just minted for a number with no
 * application account behind it (`checkAccount`'s `phone-only-new`). Only ever
 * called for that case: anything holding more (a password, Google, Apple) is a
 * real sign-up that stalled, and deleting it would take the user's Google or
 * Apple identity with it. Best-effort: if the delete itself fails we must still
 * not leave the app signed in as an account nothing recognizes, so fall back to
 * signing out — a retry re-confirms into the same uid either way.
 */
async function discardPhoneOnlyAccount(user: FirebaseUser): Promise<void> {
  try {
    await user.delete();
    return;
  } catch {
    // Fall through to signing out.
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
 * throw `COULD_NOT_CONNECT` rather than guess. The draft is reset; a parked
 * collision credential is kept, so the next attempt can still link it.
 */
async function checkAccount(user: FirebaseUser): Promise<AccountCheck> {
  try {
    await api.get('/auth/me');
    return 'exists';
  } catch (error) {
    if (isNotFound(error)) return isPhoneOnly(user) ? 'phone-only-new' : 'unfinished';
    useRegistrationDraftStore.getState().reset();
    await auth().signOut().catch(() => undefined);
    // A parked credential must survive this — only the Google session itself
    // (so the next "Continue with Google" shows the account picker, not
    // whoever she just failed to check) needs forgetting here.
    await signOutOfGoogle();
    throw COULD_NOT_CONNECT_ERROR;
  }
}

/**
 * Checks an SMS code and hands back the account it signed in as.
 *
 * On Android, Firebase can read the SMS and sign in by itself before the code
 * is submitted; the code is then spent, and `confirm` rejects. If the app is
 * already signed in as that very number, that sign-in is the one we wanted.
 * The same holds for a retry that re-uses a code already spent.
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

// ── Sign-in doors ────────────────────────────────────────────────────────────

/**
 * Signs in with the email/password credential. The secondary door
 * (`EmailSignInScreen`).
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
 * Sends an SMS code that signs in as the number — the sign-in door, the SMS
 * password reset and the phone wizard's step 3 — and hands back the handle the
 * code is checked against. `forceResend` marks a user-tapped resend rather
 * than the first send. (The Google/Apple wizard links a phone instead:
 * `useSendPhoneLinkCode`.)
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
 * Finishes the default door (`SignInScreen`): check the SMS code, then ask what
 * the number belongs to.
 *
 * Confirming a code *is* a sign-in, so Firebase mints a phone-only account for
 * a number it has never seen — invisible to the email door and unusable by
 * "reset password". That one is deleted, and she is told to sign up. A number
 * on an account that holds more (a password, Google, Apple) but has no row is
 * an unfinished sign-up: `'needs-setup'`, which the root gate resumes.
 *
 * A parked collision credential is left for the caller to link — unlike
 * `useSignInWithEmail`, which links it itself.
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
        // Collision B parked a Google/Apple credential and sent her here on a
        // phoneHint that turned out to belong to nobody — the credential is
        // still real, so offer it instead of a dead-end "sign up first",
        // which would just send her right back to the same banner.
        const pending = usePendingLinkStore.getState().pending;
        if (pending) {
          usePendingLinkStore.getState().clear();
          throw noAccountForPhoneWithParkedCredential(pending.provider);
        }
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

// ── Password reset ───────────────────────────────────────────────────────────

/**
 * Resets the password by SMS ("Text me a code instead"). Confirming the code
 * signs the user in as the phone uid, then `updatePassword` sets a new
 * password on the account's email — adding a `password` provider if it had
 * none (a Google/Apple account), and keeping Google/Apple either way, which
 * the reset mail does not. Because confirming the code is itself a fresh
 * sign-in, `updatePassword` never trips `auth/requires-recent-login`.
 *
 * Confirming a code *is* a sign-in, though, so the account is checked first,
 * as `useConfirmPhoneSignIn` does. A phone-only account Firebase just minted
 * is discarded. An unfinished sign-up (`'needs-setup'`) is left alone — its
 * password is the one she chose moments ago in the wizard, and the root gate
 * resumes it. An account with a row but no email on file has no password to
 * reset: it is signed out with the same message, but never deleted.
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
      if (account === 'phone-only-new') {
        await discardPhoneOnlyAccount(user);
        throw NO_ACCOUNT_FOR_PHONE_ERROR;
      }
      if (!user.email) {
        // A row, but no email to put a password on — e.g. a row the server
        // re-attached to a fresh phone-only Firebase account. Never delete it:
        // that would orphan the row again.
        await auth().signOut().catch(() => undefined);
        throw NO_PASSWORD_ON_ACCOUNT_ERROR;
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

// ── Leaving: sign out, discard, delete ───────────────────────────────────────

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
 * Deletes the signed-in account. On iOS an Apple sign-in is revoked first
 * (Apple's rule for account deletion). Android has no way to revoke, so it
 * deletes anyway and the server logs it. The server does the deleting and
 * refuses (409) while a booking is active, or (403) for staff; those refusals
 * are shown as the server worded them. Signing out afterwards can't fail the
 * deletion: the account is already gone. `'cancelled'`: the Apple sheet was
 * closed, and nothing was touched. Screens use it via `useConfirmDeleteAccount`.
 */
export function useDeleteAccount() {
  return useMutation<'deleted' | 'cancelled', MappedAuthError, void>({
    mutationFn: async () => {
      const user = auth().currentUser;
      if (!user) throw SIGNED_OUT_ERROR;
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

// ── Registration: phone wizard ───────────────────────────────────────────────

/**
 * The phone wizard confirmed into a uid that already has a registered row —
 * the number is an existing account's, which step 1's availability check
 * normally stops. Its password must never be swapped for the wizard's, so she
 * is signed out and sent to sign in. `account-exists` gives her Step 3's
 * "Start again".
 */
const PHONE_HAS_ACCOUNT_ERROR: MappedAuthError = {
  field: 'form',
  message: 'This number already has an account. Sign in instead.',
  code: 'account-exists',
};

/**
 * Links the email/password credential onto `user`. A password provider
 * already on this uid is swapped for the new one — but only while the uid has
 * no row (a wizard abandoned after this step); a registered account's password
 * is never replaced (`PHONE_HAS_ACCOUNT_ERROR`).
 *
 * A wizard abandoned after this step and restarted with a different email or
 * password confirms into the same uid, where a plain link is refused with
 * `provider-already-linked` — which would silently leave Firebase on the
 * abandoned attempt's email/password while the DB row gets the new one.
 * `updateEmail` can't fix this up afterward — it's blocked under
 * email-enumeration protection — so unlink the stale credential and link the
 * new one in its place.
 *
 * Rejects with the raw Firebase error, which the caller maps, or with a
 * ready `MappedAuthError` from the row check.
 */
async function linkEmailPassword(user: FirebaseUser, credential: AuthCredential): Promise<void> {
  try {
    await user.linkWithCredential(credential);
  } catch (error) {
    if (authErrorCode(error) !== 'auth/provider-already-linked') throw error;
    if (await hasRegisteredRow()) {
      await auth().signOut().catch(() => undefined);
      throw PHONE_HAS_ACCOUNT_ERROR;
    }
    await user.unlink('password');
    await user.linkWithCredential(credential);
  }
}

/**
 * Whether `/auth/me` finds a row for the signed-in account. Unlike
 * `checkAccount` it signs nobody out and keeps the draft on a failed request —
 * the wizard just shows "Couldn't connect" and can be retried.
 */
async function hasRegisteredRow(): Promise<boolean> {
  try {
    await api.get('/auth/me');
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw COULD_NOT_CONNECT_ERROR;
  }
}

/** Firebase's two ways of saying another account already holds the email. */
const EMAIL_IN_USE_CODES = new Set(['auth/email-already-in-use', 'auth/credential-already-in-use']);

/**
 * Finishes the auth half of registration: checks the SMS code, then attaches
 * the email/password credential to the user Firebase just signed in.
 *
 * Confirming the code *is* a sign-in — it leaves the app authenticated as a
 * phone-only user with no password. Linking gives that same uid the
 * email/password credential `EmailSignInScreen` checks, so the verified phone
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
 *   `phone` — nothing to confirm. Any other signed-in account (or none), or
 *   one that isn't `signUpUid` (mirroring `useLinkPhoneToCurrentUser`), is
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
      signUpUid: string | null;
    }
  >({
    mutationFn: async ({ confirmation, code, phone, email, password, emailVerificationToken, signUpUid }) => {
      let user: FirebaseUser;
      if (confirmation) {
        user = await confirmCode(confirmation, code, phone);
      } else {
        const current = auth().currentUser;
        if (!current || current.phoneNumber !== phone || current.uid !== signUpUid) {
          throw SESSION_MISMATCH_ERROR;
        }
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
          if (isMappedAuthError(error)) throw error;
          const errorCode = authErrorCode(error);
          if (!errorCode || !EMAIL_IN_USE_CODES.has(errorCode)) throw mapFirebaseAuthError(error);
          if (!emailVerificationToken) throw EMAIL_TAKEN_ERROR;
          try {
            await api.post('/auth/reclaim-email', { email: normalizedEmail, emailVerificationToken });
          } catch (reclaimError) {
            throw apiStatusOf(reclaimError) === 409 ? EMAIL_TAKEN_ERROR : COULD_NOT_CONNECT_ERROR;
          }
          try {
            await linkEmailPassword(user, credential);
          } catch (relinkError) {
            throw isMappedAuthError(relinkError) ? relinkError : mapFirebaseAuthError(relinkError);
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

// ── Registration: Google/Apple wizard's phone step ───────────────────────────

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
 * `PHONE_TAKEN_ERROR` (`code: 'auth/credential-already-in-use'`) — the
 * caller's cue for collision B.
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

      // Link only when the number isn't on the account yet. A retry after a
      // later step failed finds it already there, and re-linking would spend
      // a credential for nothing.
      if (challenge && user.phoneNumber !== phone) {
        try {
          if (user.phoneNumber) await user.unlink('phone');
          const credential =
            challenge.autoVerified && !challenge.code
              ? auth.PhoneAuthProvider.credential(null)
              : auth.PhoneAuthProvider.credential(challenge.verificationId, challenge.code ?? code);
          await user.linkWithCredential(credential);
        } catch (error) {
          throw authErrorCode(error) === 'auth/credential-already-in-use'
            ? PHONE_TAKEN_ERROR
            : mapFirebaseAuthError(error);
        }
      }

      await user.getIdToken(true);
    },
  });
}

// ── Registration: backend ────────────────────────────────────────────────────

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

// ── Email verification (our own OTP) ─────────────────────────────────────────

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
