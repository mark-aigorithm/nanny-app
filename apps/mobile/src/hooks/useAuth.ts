import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RegisterRequest, UserResponse } from '@nanny-app/shared';

import { auth } from '@mobile/lib/firebase';
import type { PhoneConfirmation, UserCredential } from '@mobile/lib/firebase';
import { api, unwrap } from '@mobile/lib/api';
import { mapFirebaseAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
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

export function useForgotPassword() {
  return useMutation<void, MappedAuthError, string>({
    mutationFn: async (email) => {
      try {
        await auth().sendPasswordResetEmail(email.trim());
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
 * Sends a phone verification SMS via the real Firebase JS SDK
 * `signInWithPhoneNumber`. Firebase validates the code server-side on
 * the follow-up `confirmation.confirm(code)` call, so there are no
 * hardcoded test codes in the client.
 *
 * In Expo Go the shim internally passes a minimal fake
 * `ApplicationVerifier` — Firebase bypasses reCAPTCHA verification for
 * phone numbers listed under "Phone numbers for testing" in the Firebase
 * Console, so the dummy token is never checked. On a native build the
 * shim is replaced and @react-native-firebase/auth handles the verifier
 * natively; the hook signature stays the same.
 */
export function useLinkPhoneNumber() {
  return useMutation<PhoneConfirmation, MappedAuthError, string>({
    mutationFn: async (phoneE164) => {
      try {
        return await auth().signInWithPhoneNumber(phoneE164, true);
      } catch (error) {
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
 * Step 4 of registration — phone primary, email/password linked after.
 *
 * 1. `confirmation.confirm(code)` is the real Firebase JS SDK call.
 *    Firebase validates the code server-side; on success it creates a
 *    Firebase user whose primary provider is "phone". For numbers in
 *    "Phone numbers for testing" (Firebase Console) the preset code is
 *    accepted without an SMS being sent.
 * 2. `linkWithCredential(emailCred)` attaches the email/password the
 *    user typed in step 2 as a secondary provider, so the end state
 *    in Firebase is a single user with both phone + email.
 *
 * Identical code path for test numbers and real numbers — no branching
 * on environment.
 */
export function useConfirmPhoneCode() {
  return useMutation<
    void,
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; email: string; password: string }
  >({
    mutationFn: async ({ confirmation, code, email, password }) => {
      try {
        // 1. Verify the OTP — Firebase validates server-side.
        await confirmation.confirm(code);
        // 2. Link email/password as a secondary provider on the new user.
        const user = auth().currentUser;
        if (!user) {
          throw {
            field: 'form',
            message: 'Session expired. Please sign in again.',
          } satisfies MappedAuthError;
        }
        const emailCred = auth.EmailAuthProvider.credential(email.trim(), password);
        try {
          await user.linkWithCredential(emailCred);
        } catch (linkError) {
          // Idempotent retry: if the email is already linked (from a
          // previous partial run that got this far), that's a success,
          // not a failure. Let the flow continue to backend registration.
          const code = (linkError as { code?: string })?.code;
          if (code !== 'auth/provider-already-linked') throw linkError;
        }
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}
