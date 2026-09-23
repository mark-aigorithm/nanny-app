import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { unregisterPushToken } from '@mobile/hooks/usePushNotifications';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

/** Thrown whenever a phone number turns out to have no account behind it. */
const NO_ACCOUNT_FOR_PHONE_ERROR: MappedAuthError = {
  field: 'phone',
  message: "We couldn't find an account for that number. Sign up first.",
};

/**
 * Discards a phone-only account Firebase just minted for a number that turned
 * out to have no application account behind it. Best-effort: if the delete
 * itself fails we must still not leave the app signed in as an account
 * nothing recognizes, so fall back to signing out — a retry re-confirms into
 * the same uid either way.
 */
async function discardPhoneOnlyAccount(user: FirebaseUser): Promise<void> {
  try {
    await user.delete();
  } catch {
    await auth().signOut().catch(() => undefined);
  }
}

/** Signs in with the email/password credential. The secondary door. */
export function useSignInWithEmail() {
  return useMutation<
    UserCredential,
    MappedAuthError,
    { email: string; password: string }
  >({
    mutationFn: async ({ email, password }) => {
      try {
        return await auth().signInWithEmailAndPassword(email.trim().toLowerCase(), password);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
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

export function useSignOut() {
  const queryClient = useQueryClient();
  const clearProfile = useUserProfileStore((s) => s.clear);
  return useMutation<void, MappedAuthError, void>({
    mutationFn: async () => {
      // Release this device's push token first — the axios interceptor signs
      // the DELETE with the current user's JWT, which is gone after signOut().
      // It never throws, so it cannot block or fail the sign-out itself.
      await unregisterPushToken();
      try {
        await auth().signOut();
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
    onSuccess: () => {
      // Wipe any cached server data (profile, /me, etc.) so the next user
      // doesn't see the previous user's data. The auth listener handles the
      // Firebase user clear automatically.
      clearProfile();
      queryClient.clear();
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

      try {
        await user.linkWithCredential(
          auth.EmailAuthProvider.credential(email.trim().toLowerCase(), password),
        );
      } catch (error) {
        // Only a password provider already on *this* uid is a no-op. The
        // "already in use" codes mean a different account owns that address,
        // which the user has to resolve — let those surface.
        if ((error as { code?: string })?.code === 'auth/provider-already-linked') {
          return;
        }
        throw mapFirebaseAuthError(error);
      }
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
 * The response also carries a fresh Firebase custom token: moving the
 * account's Firebase email revokes the caller's own session, so
 * `useVerifiedEmailSubmit` trades this token in via `signInWithCustomToken`
 * right after.
 */
export function useSetVerifiedEmail() {
  const setProfile = useUserProfileStore((s) => s.setProfile);
  return useMutation<SetVerifiedEmailResponse, Error, SetVerifiedEmailRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/email', body)),
    onSuccess: (profile) => setProfile(profile),
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

