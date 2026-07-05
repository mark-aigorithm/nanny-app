import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RegisterRequest, UserResponse } from '@nanny-app/shared';

import { auth } from '@mobile/lib/firebase';
import type { UserCredential } from '@mobile/lib/firebase';
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
 * Creates the Firebase account for a phone-number-only sign-up.
 *
 * Phone verification is bypassed for now (no SMS provider), so instead of
 * the real phone-OTP flow we back the account with Firebase email/password
 * using a placeholder email derived from the phone number (see
 * `phoneToPlaceholderEmail`) plus the password collected in step 2. This
 * yields a real Firebase user + JWT that the backend accepts unchanged.
 *
 * Idempotent: if the account already exists (e.g. the user retried after a
 * partial run), sign in to it instead of failing.
 */
export function useCreatePhoneAccount() {
  return useMutation<void, MappedAuthError, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const trimmed = email.trim();
      try {
        await auth().createUserWithEmailAndPassword(trimmed, password);
      } catch (error) {
        if ((error as { code?: string })?.code === 'auth/email-already-in-use') {
          try {
            await auth().signInWithEmailAndPassword(trimmed, password);
            return;
          } catch (signInError) {
            throw mapFirebaseAuthError(signInError);
          }
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

