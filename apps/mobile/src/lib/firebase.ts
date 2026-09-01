import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { getApps, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider as JsEmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  linkWithCredential as jsLinkWithCredential,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber as jsSignInWithPhoneNumber,
  signOut,
  type ApplicationVerifier,
  type Auth,
  type AuthCredential,
  type Persistence,
  type User as JsUser,
} from 'firebase/auth';
import { secureStorageAdapter } from '@mobile/lib/secureStorage';

// getReactNativePersistence was removed from `firebase/auth` in v12 but still
// exists in the underlying `@firebase/auth` package's React Native build. Metro
// resolves `@firebase/auth` using the `react-native` field in its package.json
// (→ dist/rn/index.js) which does export it. We use require() to side-step the
// TypeScript browser-typings which don't declare it.
const { getReactNativePersistence } = require('@firebase/auth') as {
  getReactNativePersistence: (storage: typeof secureStorageAdapter) => Persistence;
};

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
    persistence: getReactNativePersistence(secureStorageAdapter),
  });
} catch {
  jsAuth = getAuth(app);
}

// End-to-end tests run against the local Auth emulator, so accounts can be
// created and signed into freely with no shared live project and no network.
// Populated from FIREBASE_AUTH_EMULATOR_HOST by app.config.ts; empty in every
// real build, where this is a no-op.
const authEmulatorHost = Constants.expoConfig?.extra?.['firebaseAuthEmulatorHost'] as
  | string
  | undefined;
if (authEmulatorHost) {
  connectAuthEmulator(jsAuth, `http://${authEmulatorHost}`, { disableWarnings: true });
}

// ── Legacy-style `auth()` API shim ─────────────────────────────────────────
// Mimics @react-native-firebase/auth so callsites don't need to change.
// Email/password, sign-out, state observation, AND phone OTP all use the
// real Firebase JS SDK — nothing is stubbed or faked.
//
// REGISTRATION FLOW:
// Every account starts as a real Firebase phone credential —
// `signInWithPhoneNumber` sends the code and `confirm()` signs the user in —
// after which the email/password credential is linked onto that same uid (see
// `useConfirmPhoneAndLink`). That linked address is always the placeholder
// derived from the phone number (`phoneToPlaceholderEmail`) — sign-in is by
// phone, for everyone, always.
//
// A user's real email is a separate thing entirely: proven by our own OTP,
// stored in `users.email`, and used only to reach them (booking receipts, the
// Paymob billing record). It is never a Firebase credential, so nothing here
// changes when someone verifies one.
//
// The `signInWithPhoneNumber` shim below passes a minimal fake
// `ApplicationVerifier`; Firebase only accepts it for numbers listed under
// "Phone numbers for testing" in the Firebase Console. Real numbers need a
// native build, where @react-native-firebase/auth replaces this shim and does
// real device attestation.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Wrap the JS SDK User in a Proxy that (a) preserves every real method
 * (getIdToken, etc.) with correct `this` binding, and (b) intercepts the
 * methods the React Native Firebase API exposes on the user object but the
 * modular JS SDK exposes as free functions, forwarding each to its modular
 * counterpart with the right `this`.
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
    // Real Firebase JS SDK call, but with a minimal inline
    // ApplicationVerifier that returns a dummy reCAPTCHA token without
    // ever loading a WebView. Firebase bypasses reCAPTCHA verification
    // entirely for numbers configured under "Phone numbers for testing"
    // in the Firebase Console, so the dummy token is never validated.
    //
    // This only works for test numbers in Expo Go — real numbers would
    // require a real verifier, which we can't provide on React Native
    // against current Firebase (expo-firebase-recaptcha is broken by
    // Firebase's reCAPTCHA Enterprise migration). That's an accepted
    // trade-off since Expo Go is a dev environment only; production
    // will use @react-native-firebase/auth on a native build, which
    // does real reCAPTCHA natively via Play Integrity / App Attestation.
    // The public ApplicationVerifier interface is `{ type, verify }`, but
    // Firebase's v2 phone auth flow also calls internal methods that live
    // on the real `RecaptchaVerifier` class — `_reset`, `_render`, etc.
    // Add them as no-ops so Firebase's JS SDK internals don't throw on
    // undefined property access.
    const fakeVerifier: ApplicationVerifier & {
      _reset: () => void;
      _render: () => Promise<number>;
      _isInvisible?: boolean;
      clear: () => void;
    } = {
      type: 'recaptcha',
      verify: async () => 'expo-go-fake-recaptcha-token',
      _reset: () => {},
      _render: async () => 0,
      _isInvisible: true,
      clear: () => {},
    };
    // eslint-disable-next-line no-console
    console.log(`[firebase shim] signInWithPhoneNumber START phone=${phoneNumber}`);
    // Race against a 20s timeout so the UI fails loudly on regressions.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject({ code: 'auth/timeout', message: 'signInWithPhoneNumber hung for 20s' }),
        20_000,
      ),
    );
    try {
      const confirmation = await Promise.race([
        jsSignInWithPhoneNumber(jsAuth, phoneNumber, fakeVerifier),
        timeout,
      ]);
      // eslint-disable-next-line no-console
      console.log('[firebase shim] signInWithPhoneNumber RESOLVED', { verificationId: (confirmation as unknown as { verificationId?: string }).verificationId });
      return confirmation as unknown as FirebaseAuthTypes.ConfirmationResult;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('[firebase shim] signInWithPhoneNumber REJECTED', err);
      throw err;
    }
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
