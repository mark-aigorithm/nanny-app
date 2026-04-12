import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider as JsEmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  linkWithCredential as jsLinkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type AuthCredential,
  type User as JsUser,
} from 'firebase/auth';

// ── Firebase JS SDK setup (Expo Go compatible) ─────────────────────────────
// @react-native-firebase/* are native modules and are not available in
// Expo Go. This file uses the Firebase JS SDK instead and exposes a thin
// `auth()` wrapper that mimics the @react-native-firebase/auth API so the
// rest of the app (useAuth, api.ts, _layout.tsx, authStore) does not need
// to change. When you switch to a native dev-client or production build,
// revert this file to `import auth from '@react-native-firebase/auth'`.
//
// Type imports from @react-native-firebase/auth are erased at runtime so
// they don't cause Expo Go to crash — they only exist at type-check time.
// ───────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.['firebaseApiKey'] as string,
  authDomain: Constants.expoConfig?.extra?.['firebaseAuthDomain'] as string,
  projectId: Constants.expoConfig?.extra?.['firebaseProjectId'] as string,
  appId: Constants.expoConfig?.extra?.['firebaseAppId'] as string,
  storageBucket: Constants.expoConfig?.extra?.['firebaseStorageBucket'] as string,
  messagingSenderId: Constants.expoConfig?.extra?.['firebaseMessagingSenderId'] as string,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;

// `initializeAuth` can only be called once per app instance. Fast Refresh
// re-executes this module, so fall back to `getAuth` on the second run.
let jsAuth: Auth;
try {
  jsAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  jsAuth = getAuth(app);
}

// ── Legacy-style `auth()` API shim ─────────────────────────────────────────
// Mimics @react-native-firebase/auth so callsites don't need to change.
// Email/password, sign-out, and state observation use the real JS SDK.
//
// REGISTRATION FLOW (Option B — phone primary, email/password linked after):
// The hook `useConfirmPhoneCode` calls `confirmation.confirm(code)` to
// create the Firebase user, then links an EmailAuthProvider credential.
//
// Phone OTP cannot actually run in Expo Go because the Firebase JS SDK
// requires a RecaptchaVerifier (browser DOM) that does not exist on React
// Native. So in this shim:
//
//   - `signInWithPhoneNumber` returns a fake ConfirmationResult whose
//     `confirm(code)` validates the code against `expoGoTestPhoneCode`
//     (from app.config.ts) and then calls the real `signInAnonymously` —
//     this creates a temporary Firebase user so subsequent operations
//     have a valid `currentUser`.
//   - The Proxy-wrapped `currentUser.linkWithCredential` forwards real
//     `EmailAuthCredential`s to the real JS SDK, which upgrades the
//     anonymous user to an email-provider user (standard Firebase pattern).
//
// Net result in Expo Go: the Firebase Console shows the user with the
// "email" provider (since anonymous gets upgraded). On a native build
// with @react-native-firebase/auth swapped in, `confirm(code)` will
// create a real phone-provider user and `linkWithCredential(email)` will
// attach email as a secondary provider — giving you the "phone + email"
// result Option B is designed for, with no hook-level code changes.
//
// Prerequisite: Anonymous auth must be enabled in the Firebase Console
// (Authentication → Sign-in method → Anonymous → Enable) so that
// `signInAnonymously` doesn't fail with `auth/admin-restricted-operation`.
// ───────────────────────────────────────────────────────────────────────────

const EXPO_GO_STUB_VERIFICATION_ID = 'expo-go-stub-verification-id';

/**
 * Wrap the JS SDK User in a Proxy that (a) preserves every real method
 * (getIdToken, etc.) with correct `this` binding, and (b) intercepts
 * `linkWithCredential` so calls targeting the React Native Firebase API
 * get forwarded to the modular JS SDK function with the right `this`.
 */
function wrapCurrentUser(user: JsUser): FirebaseAuthTypes.User {
  return new Proxy(user as object, {
    get(target, prop, receiver) {
      if (prop === 'linkWithCredential') {
        return async (credential: AuthCredential) => {
          // Delegate to the real JS SDK modular function. This works for
          // EmailAuthCredential in Expo Go (upgrading anon → email) and
          // any other future credential types. On a native build, the
          // shim is replaced entirely so this path is unused.
          return jsLinkWithCredential(target as JsUser, credential) as unknown as FirebaseAuthTypes.UserCredential;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as FirebaseAuthTypes.User;
}

type LegacyAuth = {
  readonly currentUser: FirebaseAuthTypes.User | null;
  signInWithEmailAndPassword: (
    email: string,
    password: string,
  ) => Promise<FirebaseAuthTypes.UserCredential>;
  createUserWithEmailAndPassword: (
    email: string,
    password: string,
  ) => Promise<FirebaseAuthTypes.UserCredential>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithPhoneNumber: (
    phoneNumber: string,
    forceResend?: boolean,
  ) => Promise<FirebaseAuthTypes.ConfirmationResult>;
  onAuthStateChanged: (
    callback: (user: FirebaseAuthTypes.User | null) => void,
  ) => () => void;
};

const legacy: LegacyAuth = {
  get currentUser() {
    const user = jsAuth.currentUser;
    return user ? wrapCurrentUser(user) : null;
  },
  signInWithEmailAndPassword: (email, password) =>
    signInWithEmailAndPassword(jsAuth, email, password) as unknown as Promise<FirebaseAuthTypes.UserCredential>,
  createUserWithEmailAndPassword: (email, password) =>
    createUserWithEmailAndPassword(jsAuth, email, password) as unknown as Promise<FirebaseAuthTypes.UserCredential>,
  sendPasswordResetEmail: (email) => sendPasswordResetEmail(jsAuth, email),
  signOut: () => signOut(jsAuth),
  signInWithPhoneNumber: async (phoneNumber) => {
    // eslint-disable-next-line no-console
    console.log(`[firebase shim] Expo Go: pretending to send SMS to ${phoneNumber}`);
    // Fake ConfirmationResult whose `confirm(code)` validates the test
    // code then calls real `signInAnonymously`, establishing a Firebase
    // user so the subsequent `linkWithCredential(emailCred)` can upgrade
    // it to an email-provider user. On a native build, this whole method
    // is replaced by @react-native-firebase/auth's real phone flow.
    const fake = {
      verificationId: EXPO_GO_STUB_VERIFICATION_ID,
      confirm: async (code: string) => {
        const expected = Constants.expoConfig?.extra?.['expoGoTestPhoneCode'] as
          | string
          | undefined;
        if (code !== expected) {
          throw { code: 'auth/invalid-verification-code' };
        }
        // eslint-disable-next-line no-console
        console.log('[firebase shim] Expo Go: test code accepted, signing in anonymously');
        const cred = await signInAnonymously(jsAuth);
        return cred as unknown as FirebaseAuthTypes.UserCredential;
      },
    };
    return fake as unknown as FirebaseAuthTypes.ConfirmationResult;
  },
  onAuthStateChanged: (callback) =>
    onAuthStateChanged(jsAuth, (user) =>
      callback(user ? wrapCurrentUser(user) : null),
    ),
};

type AuthFn = (() => LegacyAuth) & {
  EmailAuthProvider: {
    credential: (email: string, password: string) => FirebaseAuthTypes.AuthCredential;
  };
};

const authFn = (() => legacy) as AuthFn;
// Delegate to the real JS SDK EmailAuthProvider — it produces a genuine
// EmailAuthCredential that the real `linkWithCredential` (inside the
// currentUser Proxy) will accept. On a native build this maps directly
// onto @react-native-firebase/auth's own EmailAuthProvider.
authFn.EmailAuthProvider = {
  credential: (email, password) =>
    JsEmailAuthProvider.credential(email, password) as unknown as FirebaseAuthTypes.AuthCredential,
};

export const auth = authFn;
export type FirebaseUser = FirebaseAuthTypes.User;
export type PhoneConfirmation = FirebaseAuthTypes.ConfirmationResult;
export type UserCredential = FirebaseAuthTypes.UserCredential;
