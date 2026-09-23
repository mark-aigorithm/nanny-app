import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getApiErrorMessage } from '@mobile/lib/api';
import {
  useSendEmailOtp,
  useSetVerifiedEmail,
  useSignOut,
  useVerifyEmailOtp,
} from '@mobile/hooks/useAuth';
import { auth } from '@mobile/lib/firebase';
import { noticeDialog } from '@mobile/store/confirmDialogStore';

/**
 * Where `VerifyEmailScreen` should go once `confirmCode` settles:
 *  - `'home'` — verified (and re-signed-in, if that was needed).
 *  - `'sign-in'` — the gate succeeded server-side, but the fresh session
 *    could not be established; the caller has already been signed out and
 *    shown a notice, so this is the phone sign-in door, not the old session.
 *  - `null` — the code/token itself was rejected; `error` is set, stay put.
 */
export type VerifyEmailOutcome = 'home' | 'sign-in' | null;

/**
 * Turns a code the user just received into a verified address on their user
 * row. Used by `VerifyEmailScreen`, the blocking screen an account created
 * before registration proved an address lands on. Mirrors `useIdSubmit`.
 *
 * The address is for reaching them — booking receipts, and the billing record
 * sent to Paymob — not for signing in. Authentication is the phone number,
 * but attaching the address moves the account's *Firebase* email, which is a
 * side effect of proving it (see `setVerifiedEmail`'s doc comment on the
 * backend): that revokes every existing session for the uid, including the
 * one this screen is running on. This hook owns re-establishing a session
 * when that happens, so the screen only has to know where to navigate next.
 */
export function useVerifiedEmailSubmit() {
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();
  const setVerifiedEmail = useSetVerifiedEmail();
  const signOut = useSignOut();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);

  /** Mail a code to `email`. Resolves true when it is on its way. */
  async function requestCode(email: string): Promise<boolean> {
    setError(null);
    try {
      await sendOtp.mutateAsync(email.trim().toLowerCase());
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the code. Please try again.'));
      return false;
    }
  }

  /**
   * Check the code, spend the token, and re-establish a session if the
   * backend's swap revoked the current one. See `VerifyEmailOutcome` for
   * what each resolved value means.
   */
  async function confirmCode(email: string, code: string): Promise<VerifyEmailOutcome> {
    setError(null);
    const normalised = email.trim().toLowerCase();

    let customToken: string | undefined;
    try {
      const { verificationToken } = await verifyOtp.mutateAsync({ email: normalised, code });
      ({ customToken } = await setVerifiedEmail.mutateAsync({
        email: normalised,
        verificationToken,
      }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not confirm that code. Please try again.'));
      return null;
    }

    // A missing/empty customToken means nothing was revoked: either this was
    // the idempotent no-op path outside its recovery window, or — a backend
    // deployed after this mobile build shipped OTA, mid-rollout — the
    // endpoint never sent one at all. Either way the current session is
    // still good, so there is nothing to trade in; treat it exactly like the
    // "no swap happened" case rather than silently stalling here.
    if (customToken) {
      try {
        // The backend just swapped the Firebase email, which revokes every
        // existing session for this uid — the ID token this screen is
        // running on is already dead. Trade the custom token for a fresh
        // session on the same uid.
        await auth().signInWithCustomToken(customToken);
      } catch {
        // The gate already succeeded server-side — her row and the Firebase
        // account both hold the new address — only re-establishing a
        // session failed. Sign out fully (push token released, cached
        // profile/query state cleared — same as any other sign-out) rather
        // than leave her on a dead session, and say so through the app's
        // themed notice dialog: there is no route-param convention in this
        // app for carrying a message across a screen, and the dialog's host
        // is mounted at the root layout, so it survives the navigation the
        // screen does right after this returns.
        await signOut.mutateAsync().catch(() => undefined);
        noticeDialog({
          title: 'Signed out',
          message: 'Your email is verified. Please sign in again.',
        });
        return 'sign-in';
      }
    }

    // The mutation's onSuccess already wrote the updated profile into the
    // store, which is what the root router reads; drop the cached /auth/me
    // alongside it so nothing refetches its way back to an unverified
    // profile.
    await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    return 'home';
  }

  return {
    requestCode,
    confirmCode,
    isSending: sendOtp.isPending,
    isConfirming: verifyOtp.isPending || setVerifiedEmail.isPending,
    error,
    setError,
  };
}
