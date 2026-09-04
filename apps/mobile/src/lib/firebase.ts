import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { getApp, getApps, initializeApp } from 'firebase/app';

// ── Auth: native (@react-native-firebase/auth) ──────────────────────────────
// The production auth path. The native module auto-initializes from
// google-services.json (Android) / GoogleService-Info.plist (iOS), persists the
// session natively, and performs real device attestation for phone verification
// (Play Integrity on Android, an APNs silent push on iOS) — so real phone
// numbers receive a real SMS, unlike the old Firebase JS SDK shim.
//
// This module exposes exactly the `auth()` surface the rest of the app already
// consumes (currentUser, signInWithEmailAndPassword, signInWithPhoneNumber,
// onAuthStateChanged, linkWithCredential, confirm, EmailAuthProvider.credential),
// so useAuth, api.ts and authStore need no changes. Requires a native build —
// not available in Expo Go, which the app already needs a dev-client for.
//
// ── Storage: Firebase JS SDK ────────────────────────────────────────────────
// Firebase Storage is still consumed through the Firebase JS SDK
// (@react-native-firebase/storage is not installed), and the JS SDK needs its
// default app initialized before use. We initialize it here from the client
// config in app.config.ts's `extra` block and export the app as `firebaseApp`
// for lib/storage.ts. Auth (native) and Storage (JS SDK) are independent
// Firebase surfaces — initializing the JS app does not touch the native auth
// module. This init is REQUIRED: without it, storage.ts's top-level
// `getStorage(getApp())` throws `app/no-app` at startup, which on iOS 26 the
// New-Architecture TurboModule exception path turns into a fatal launch crash.
// ────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.['firebaseApiKey'] as string,
  authDomain: Constants.expoConfig?.extra?.['firebaseAuthDomain'] as string,
  projectId: Constants.expoConfig?.extra?.['firebaseProjectId'] as string,
  appId: Constants.expoConfig?.extra?.['firebaseAppId'] as string,
  storageBucket: Constants.expoConfig?.extra?.['firebaseStorageBucket'] as string,
  messagingSenderId: Constants.expoConfig?.extra?.['firebaseMessagingSenderId'] as string,
};

// The JS-SDK app, consumed only by lib/storage.ts. Guarded so Fast Refresh
// re-running this module reuses the existing app instead of throwing.
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// End-to-end tests run against the local Firebase Auth emulator, so accounts
// can be created and phone-verified freely with no live project and no real
// SMS. `firebaseAuthEmulatorHost` is populated from FIREBASE_AUTH_EMULATOR_HOST
// by app.config.ts (typically 10.0.2.2:9099 from an Android emulator) and is
// empty in every real build, where this is a no-op. Wrapped in try/catch
// because Fast Refresh re-runs this module and useEmulator() throws once the
// auth instance has been used.
const authEmulatorHost = Constants.expoConfig?.extra?.['firebaseAuthEmulatorHost'] as
  | string
  | undefined;
if (authEmulatorHost) {
  try {
    auth().useEmulator(`http://${authEmulatorHost}`);
  } catch {
    // Already connected on a previous run (Fast Refresh) — safe to ignore.
  }
}

export { auth };
export type FirebaseUser = FirebaseAuthTypes.User;
export type PhoneConfirmation = FirebaseAuthTypes.ConfirmationResult;
export type UserCredential = FirebaseAuthTypes.UserCredential;
