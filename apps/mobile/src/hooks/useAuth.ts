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
 * Sends a phone verification SMS via `signInWithPhoneNumber`. The returned
 * `ConfirmationResult` is consumed by `useConfirmPhoneCode`, which calls
 * `confirmation.confirm(code)` to create the Firebase user with the phone
 * provider as primary, then links the email/password collected in step 2
 * as a secondary provider via `linkWithCredential(EmailAuthProvider.credential)`.
 *
 * There is deliberately NO `currentUser` check here — in the phone-primary
 * flow, no Firebase user exists yet at this point. The user is created
 * downstream inside `confirmation.confirm(code)`.
 *
 * Why `signInWithPhoneNumber` instead of the event-based `verifyPhoneNumber`?
 * The ConfirmationResult API is a clean Promise → object with `verificationId`,
 * whereas `verifyPhoneNumber` returns a `PhoneAuthListener` that you have to
 * subscribe to via `.on('state_changed', ...)` to extract the same value.
 * Same SMS, simpler call site.
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
 * 1. `confirmation.confirm(code)` verifies the OTP and creates the
 *    Firebase user. On a native build with @react-native-firebase/auth,
 *    this yields a user whose primary provider is "phone". In Expo Go,
 *    the shim routes this through `signInAnonymously` instead (see
 *    src/lib/firebase.ts) so the result is an anonymous user we can
 *    then upgrade.
 * 2. `linkWithCredential(emailCred)` attaches the email/password the
 *    user typed in step 2 as a secondary provider. Firebase auto-merges
 *    anonymous upgrades, so in Expo Go the user ends up with just the
 *    email provider; on native it ends up with phone + email.
 *
 * The hook shape is native-compatible — swapping the shim for the real
 * @react-native-firebase/auth module requires zero changes here.
 */
export function useConfirmPhoneCode() {
  return useMutation<
    void,
    MappedAuthError,
    { confirmation: PhoneConfirmation; code: string; email: string; password: string }
  >({
    mutationFn: async ({ confirmation, code, email, password }) => {
      try {
        // 1. Verify the OTP (creates phone user on native, anon on Expo Go).
        await confirmation.confirm(code);
        // 2. Link email/password as a secondary provider. Note: in Expo Go
        // this upgrades the anonymous user Firebase just created.
        const user = auth().currentUser;
        if (!user) {
          throw {
            field: 'form',
            message: 'Session expired. Please sign in again.',
          } satisfies MappedAuthError;
        }
        const emailCred = auth.EmailAuthProvider.credential(email.trim(), password);
        await user.linkWithCredential(emailCred);
      } catch (error) {
        throw mapFirebaseAuthError(error);
      }
    },
  });
}
