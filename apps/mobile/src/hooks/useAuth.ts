import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RegisterRequest,
  SetVerifiedEmailRequest,
  UserResponse,
  VerifyEmailOtpRequest,
  VerifyEmailOtpResponse,
} from '@nanny-app/shared';

import { auth } from '@mobile/lib/firebase';
import type { PhoneConfirmation, UserCredential } from '@mobile/lib/firebase';
import { api, unwrap } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { unregisterPushToken } from '@mobile/hooks/usePushNotifications';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

export function useSignIn() {
  return useMutation<
    UserCredential,
    MappedAuthError,
    { email: string; password: string }
  >({
    mutationFn: async ({ email, password }) => {
      try {
        return await auth().signInWithEmailAndPassword(email.trim(), password);
      } catch (error) {
        throw mapFirebaseAuthError(error);
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
 * The address passed here is always the placeholder derived from the phone
 * number (see `phoneToPlaceholderEmail`) — for both roles, because sign-in is
 * by phone for both. It is only a credential; the real address, proved on step
 * 2 of the wizard, goes to `POST /auth/register` and lands in `users.email`.
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
 */
export function useSetVerifiedEmail() {
  const setProfile = useUserProfileStore((s) => s.setProfile);
  return useMutation<UserResponse, Error, SetVerifiedEmailRequest>({
    mutationFn: async (body) => unwrap(api.post('/auth/email', body)),
    onSuccess: (profile) => setProfile(profile),
  });
}

