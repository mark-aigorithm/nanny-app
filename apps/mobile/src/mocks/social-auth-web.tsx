/**
 * Web stub for lib/socialAuth in Vite preview builds. The real module imports
 * the Google Sign-In and Apple Authentication native modules, which ship JSX
 * in .js files and have no web implementation; anything importing `useAuth`
 * (every auth screen) pulls it in. A preview never signs in, so every
 * credential call resolves to "cancelled".
 */
import type { SocialProvider } from '@mobile/types';

export const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

export function isAuthEmulator(): boolean {
  return false;
}

export async function getGoogleCredential(): Promise<null> {
  return null;
}

export async function getAppleCredential(): Promise<null> {
  return null;
}

export async function getAppleAuthorizationCode(): Promise<null> {
  return null;
}

export function getSocialCredential(_provider: SocialProvider): Promise<null> {
  return Promise.resolve(null);
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  return false;
}

export async function signOutOfGoogle(): Promise<void> {}
