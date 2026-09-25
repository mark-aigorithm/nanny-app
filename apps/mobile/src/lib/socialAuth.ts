import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { auth } from '@mobile/lib/firebase';
import type { AuthCredential } from '@mobile/lib/firebase';
import { authErrorCode, isMappedAuthError, type MappedAuthError } from '@mobile/lib/authErrors';
import { requestE2eGoogleEmail } from '@mobile/store/e2eGooglePickerStore';
import type { SocialProvider } from '@mobile/types';

/**
 * Google and Apple sign-in, up to the Firebase credential.
 *
 * The native SDKs show their own sheets and hand back an ID token; this turns
 * that into the credential RNFB's `signInWithCredential` / `linkWithCredential`
 * take. What happens next — which account, whether to register or link — is
 * `useSocialSignIn`'s business, not this module's.
 *
 * Apple is iOS-only (the App Store requires it once Google is offered there);
 * Android never shows or calls it.
 */

/**
 * What a provider's sheet hands back: the Firebase credential, plus the name
 * and email it shared (a fallback for seeding the wizard — the account's own
 * email wins).
 */
export type SocialCredentialResult = {
  provider: SocialProvider;
  credential: AuthCredential;
  profile: { firstName: string; lastName: string; email: string | null };
};

/** The provider's name as the UI writes it ("Continue with Google"). */
export const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

const GOOGLE_FAILED: MappedAuthError = { field: 'form', message: 'Google sign-in failed. Please try again.' };
const APPLE_FAILED: MappedAuthError = { field: 'form', message: 'Apple sign-in failed. Please try again.' };

function extra(key: string): unknown {
  return Constants.expoConfig?.extra?.[key];
}

/**
 * True when native Auth points at the local emulator — the E2E lab. Empty in
 * every real build (see app.config.ts `firebaseAuthEmulatorHost`).
 */
export function isAuthEmulator(): boolean {
  return Boolean(extra('firebaseAuthEmulatorHost'));
}

let googleConfigured = false;
function configureGoogle(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: extra('googleWebClientId') as string | undefined });
  googleConfigured = true;
}

/**
 * The E2E seam. Google's sheet needs a real Google account on the device, which
 * the lab's emulator cannot have, so under the Auth emulator a small picker
 * asks for an address instead, and the emulator accepts an unsigned claim set
 * in place of a Google ID token. The `sub` is derived from the address, so the
 * same address is the same Google identity on every run.
 *
 * An address typed as `unverified:<address>` claims an email Google has not
 * verified. The emulator merges any verified Google email into the account that
 * already holds it, so this is the only way it raises
 * `account-exists-with-different-credential` — the collision production raises
 * for Google domains Firebase does not trust (C14).
 */
const E2E_UNVERIFIED_PREFIX = 'unverified:';

async function getE2eGoogleCredential(): Promise<SocialCredentialResult | null> {
  const typed = await requestE2eGoogleEmail();
  if (!typed) return null;
  const raw = typed.trim().toLowerCase();
  const emailVerified = !raw.startsWith(E2E_UNVERIFIED_PREFIX);
  const email = emailVerified ? raw : raw.slice(E2E_UNVERIFIED_PREFIX.length);
  const claims = { sub: `e2e-${email}`, email, email_verified: emailVerified, name: 'E2E Google' };
  return {
    provider: 'google',
    credential: auth.GoogleAuthProvider.credential(JSON.stringify(claims)),
    profile: { firstName: 'E2E', lastName: 'Google', email },
  };
}

/**
 * Shows Google's account sheet (or the E2E picker, under the Auth emulator).
 * `null` when the user closes it; a `MappedAuthError` on any other failure.
 */
export async function getGoogleCredential(): Promise<SocialCredentialResult | null> {
  if (isAuthEmulator()) return getE2eGoogleCredential();
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    const { idToken, user } = response.data;
    if (!idToken) throw GOOGLE_FAILED;
    return {
      provider: 'google',
      credential: auth.GoogleAuthProvider.credential(idToken),
      profile: {
        firstName: user.givenName ?? '',
        lastName: user.familyName ?? '',
        email: user.email ?? null,
      },
    };
  } catch (error) {
    if (isMappedAuthError(error)) throw error;
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return null;
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw { field: 'form', message: 'Google sign-in needs Google Play services on this device.' } satisfies MappedAuthError;
      }
    }
    throw GOOGLE_FAILED;
  }
}

/**
 * Shows Apple's sheet (iOS only). `null` when the user closes it.
 *
 * Apple binds its identity token to a nonce: Apple gets the SHA-256 of a random
 * value, and Firebase gets the raw value to check against it.
 */
export async function getAppleCredential(): Promise<SocialCredentialResult | null> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!result.identityToken) throw APPLE_FAILED;
    return {
      provider: 'apple',
      credential: auth.AppleAuthProvider.credential(result.identityToken, rawNonce),
      // Apple sends the name only on the very first authorization.
      profile: {
        firstName: result.fullName?.givenName ?? '',
        lastName: result.fullName?.familyName ?? '',
        email: result.email ?? null,
      },
    };
  } catch (error) {
    if (isMappedAuthError(error)) throw error;
    if (authErrorCode(error) === 'ERR_REQUEST_CANCELED') return null;
    throw APPLE_FAILED;
  }
}

/**
 * A fresh Apple authorization code for the signed-in Apple ID — what
 * `auth().revokeToken` needs to disconnect the app from it before the account
 * is deleted (Apple's rule). No scopes: only the code is wanted. `null` when
 * the user closes the sheet.
 */
export async function getAppleAuthorizationCode(): Promise<string | null> {
  try {
    const result = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    if (!result.authorizationCode) throw APPLE_FAILED;
    return result.authorizationCode;
  } catch (error) {
    if (isMappedAuthError(error)) throw error;
    if (authErrorCode(error) === 'ERR_REQUEST_CANCELED') return null;
    throw APPLE_FAILED;
  }
}

/** `getGoogleCredential` or `getAppleCredential`, by provider. */
export function getSocialCredential(provider: SocialProvider): Promise<SocialCredentialResult | null> {
  return provider === 'google' ? getGoogleCredential() : getAppleCredential();
}

/** Whether to offer "Continue with Apple": iOS only, and only where the device supports it. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Forgets the Google account on the device so the next tap shows the picker. */
export async function signOutOfGoogle(): Promise<void> {
  if (isAuthEmulator()) return;
  try {
    configureGoogle();
    await GoogleSignin.signOut();
  } catch {
    // Best-effort: signing out of the app must never fail on this.
  }
}
