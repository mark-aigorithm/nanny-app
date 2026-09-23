import { useState } from 'react';

import { getApiErrorMessage } from '@mobile/lib/api';
import { useSendEmailOtp, useSetVerifiedEmail, useVerifyEmailOtp } from '@mobile/hooks/useAuth';

/**
 * Turns a code the user just received into a verified address on their user
 * row. Used by `VerifyEmailScreen`, the blocking screen an account created
 * before registration proved an address lands on. Mirrors `useIdSubmit`.
 *
 * The address is for reaching them — booking receipts, and the billing record
 * sent to Paymob — not for signing in. Authentication is the phone number and
 * the Firebase credential behind it is left untouched, so nothing here needs
 * a password or a re-authentication.
 */
export function useVerifiedEmailSubmit() {
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();
  const setVerifiedEmail = useSetVerifiedEmail();

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
   * Check the code and spend the token it buys. Resolves with the fresh
   * Firebase custom token once her row carries the address — attaching it
   * swaps the Firebase email, which revokes the caller's own session, so the
   * backend mints this as the way back in (see `setVerifiedEmail`'s doc
   * comment on the backend). The screen trades it for a session via
   * `signInWithCustomToken`. Null leaves `error` set for it to show.
   */
  async function confirmCode(email: string, code: string): Promise<string | null> {
    setError(null);
    const normalised = email.trim().toLowerCase();
    try {
      const { verificationToken } = await verifyOtp.mutateAsync({ email: normalised, code });
      const { customToken } = await setVerifiedEmail.mutateAsync({
        email: normalised,
        verificationToken,
      });
      return customToken;
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not confirm that code. Please try again.'));
      return null;
    }
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
