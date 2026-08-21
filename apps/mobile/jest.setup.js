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
// (mocks 4–7 follow the safe-area block below)
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

// ── Native modules with no JS implementation under jest ─────────────────────
// The four below are native Expo/RN modules: importing them in jest either
// throws or returns undefined, so any screen that touches one cannot render.
// Each previously had to be re-mocked per test file; the defaults here are
// permissive ("granted", empty result) so a screen mounts, and a test that
// cares about a specific outcome overrides with its own `jest.mock(...)`.

// 4. Location — screens request permission on mount and read a position.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  // Cairo city centre, matching the coordinates the backend factories use.
  getCurrentPositionAsync: jest
    .fn()
    .mockResolvedValue({ coords: { latitude: 30.0444, longitude: 31.2357 } }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([]),
  Accuracy: { Balanced: 3, High: 4 },
}));

// 5. Notifications — the push hook registers listeners at mount; each returns
//    a subscription whose `remove` runs on unmount, so it must be a real fn.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  removeNotificationSubscription: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { MAX: 5 },
}));

// 6. Image picker — defaults to the user cancelling, so no test accidentally
//    proceeds into an upload path it did not intend to exercise.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: null }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: null }),
  MediaTypeOptions: { Images: 'Images' },
}));

// 7. Maps — react-native-maps' native views render nothing under jest. Stub
//    them as plain Views so a map screen's surrounding layout still renders
//    and can be asserted on.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const passthrough = (name) => {
    const Component = (props) => React.createElement(View, props, props.children);
    Component.displayName = name;
    return Component;
  };
  const MapView = passthrough('MapView');
  return {
    __esModule: true,
    default: MapView,
    MapView,
    Marker: passthrough('Marker'),
    Callout: passthrough('Callout'),
    Circle: passthrough('Circle'),
    Polyline: passthrough('Polyline'),
    PROVIDER_GOOGLE: 'google',
  };
});
