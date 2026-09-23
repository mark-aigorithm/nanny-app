import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import Constants from 'expo-constants';

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
// The Firebase JS SDK is gone from the app entirely. It lingered here to keep a
// second, parallel Firebase app initialized for lib/storage.ts, which was the
// direct cause of every upload failing with `storage/unauthorized`: that app
// held no signed-in user, so uploads went out unauthenticated while auth lived
// over here. Storage now uses @react-native-firebase/storage and shares this
// session. Nothing in the app should initialize a JS-SDK app again.
// ────────────────────────────────────────────────────────────────────────────

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

// The live-Firebase E2E suite (e2e/live.mjs) signs in on the two phone numbers
// the Firebase console lists as test numbers: fixed codes, no SMS. Firebase
// still tries to verify the *app* first — Play Integrity, then a reCAPTCHA page
// — which an Android emulator driven by Maestro cannot get through. This skips
// that step, and Firebase honours it only for those fictional console numbers:
// a real number still fails without a verified app. The extra
// `firebaseAppVerificationDisabledForTesting` is populated from
// FIREBASE_APP_VERIFICATION_DISABLED_FOR_TESTING by app.config.ts, set only by
// `e2e:metro:live`, and false in every real build, where this is a no-op.
// Also gated on __DEV__: the suite only ever runs a debug build, so a release
// binary ignores the flag even if a stray env var ever set it at build time.
const appVerificationDisabledForTesting =
  __DEV__ &&
  Constants.expoConfig?.extra?.['firebaseAppVerificationDisabledForTesting'] === true;
if (appVerificationDisabledForTesting) {
  auth().settings.appVerificationDisabledForTesting = true;
}

export { auth };
export type FirebaseUser = FirebaseAuthTypes.User;
export type PhoneConfirmation = FirebaseAuthTypes.ConfirmationResult;
export type UserCredential = FirebaseAuthTypes.UserCredential;
