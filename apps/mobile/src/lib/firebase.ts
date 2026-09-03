import auth from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import Constants from 'expo-constants';

// ── Native Firebase auth (@react-native-firebase/auth) ──────────────────────
// The production auth path. The native module auto-initializes from
// google-services.json (Android) / GoogleService-Info.plist (iOS), persists the
// session natively (Keychain / Keystore), and — crucially — performs real
// device attestation for phone verification (Play Integrity on Android, an APNs
// silent push on iOS). Real phone numbers therefore receive a real SMS, with no
// reCAPTCHA WebView and none of the "test numbers only" limitation of the old
// Firebase JS SDK shim.
//
// This module exposes exactly the `auth()` surface the rest of the app already
// consumes — `currentUser`, `signInWithEmailAndPassword`, `signInWithPhoneNumber`,
// `onAuthStateChanged`, `linkWithCredential`, `confirm`, and
// `auth.EmailAuthProvider.credential`. Those are the native module's own
// methods, so useAuth, api.ts and authStore need no changes.
//
// Requires a native build — a dev-client, an EAS build, TestFlight, or the E2E
// debug APK. It is NOT available in Expo Go, but the app already needs a
// dev-client for the VLC live camera monitor and native FCM, so nothing is
// lost. Unit tests mock this module (jest.setup.js) and the web preview stubs
// it (vite.preview.config.ts), so neither exercises the native module.
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

export { auth };
export type FirebaseUser = FirebaseAuthTypes.User;
export type PhoneConfirmation = FirebaseAuthTypes.ConfirmationResult;
export type UserCredential = FirebaseAuthTypes.UserCredential;
