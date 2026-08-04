/**
 * Global test setup for the mobile app — wired via `setupFilesAfterEnv` in
 * jest.config.js. It declares the three mocks nearly every screen/hook test
 * needs, so individual test files no longer have to re-declare them.
 *
 *   1. `@mobile/lib/firebase` initializes the Firebase JS SDK at IMPORT time
 *      (getApps/initializeApp run at the top level). Any module that reaches it
 *      transitively — most do, through `@mobile/lib/api` — throws in jest,
 *      which has no Firebase credentials. Stubbing it makes importing the API
 *      layer (and therefore almost any screen or hook) safe.
 *   2. `@mobile/lib/api` gets a no-network default so a rendered screen can't
 *      fire a real request at the backend. The REAL `unwrap`/error helpers are
 *      kept (they are pure), so hooks that unwrap an envelope still behave.
 *   3. `react-native-safe-area-context` has no provider mounted in jest, so
 *      `useSafeAreaInsets` would be undefined and crash any screen with a
 *      floating bar. Returns zero insets.
 *
 * A per-file `jest.mock(...)` for any of these overrides the global default —
 * that is how a test supplies specific API responses (see, e.g.,
 * usePendingRating.test.tsx). This file only provides the fallback.
 */

// 1. Firebase — stub the eager-init module with a no-op `auth()` shim that
//    mirrors the real module's shape (a callable carrying EmailAuthProvider).
jest.mock('@mobile/lib/firebase', () => {
  const legacyAuth = {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    signOut: jest.fn(),
    signInWithPhoneNumber: jest.fn(),
    onAuthStateChanged: jest.fn(() => () => {}),
  };
  const auth = Object.assign(() => legacyAuth, {
    EmailAuthProvider: { credential: jest.fn() },
  });
  return { auth };
});

// 2. API — default no-network stub; keep the real (pure) unwrap/error helpers.
jest.mock('@mobile/lib/api', () => {
  const actual = jest.requireActual('@mobile/lib/api');
  const emptyEnvelope = { data: { data: null, error: null } };
  return {
    ...actual,
    api: {
      get: jest.fn().mockResolvedValue(emptyEnvelope),
      post: jest.fn().mockResolvedValue(emptyEnvelope),
      put: jest.fn().mockResolvedValue(emptyEnvelope),
      patch: jest.fn().mockResolvedValue(emptyEnvelope),
      delete: jest.fn().mockResolvedValue(emptyEnvelope),
    },
  };
});

// 3. Safe-area insets — no SafeAreaProvider is mounted in jest.
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const passthrough = ({ children }) => children;
  return {
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
    SafeAreaInsetsContext: {
      Provider: passthrough,
      Consumer: ({ children }) => children(inset),
    },
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
  };
});
