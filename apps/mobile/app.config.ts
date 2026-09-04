import type { ExpoConfig } from 'expo/config';

/** Keep in sync with src/constants/app.ts — Expo config cannot import from src/. */
const APP_NAME = 'NannyNow';

// Google Maps key for react-native-maps (Android + iOS). Injected from the
// environment only — never hardcode it in the repo. Set GOOGLE_MAPS_API_KEY
// locally (.env, untracked) and as an EAS secret for builds.
const GOOGLE_MAPS_API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';

// Google Places / Geocoding key for registration location autocomplete +
// reverse geocoding. Falls back to the Maps key so a single key with Places +
// Geocoding APIs enabled works without a second env var.
const GOOGLE_PLACES_API_KEY =
  process.env['GOOGLE_PLACES_API_KEY'] ?? GOOGLE_MAPS_API_KEY;

const config: ExpoConfig = {
  name: APP_NAME,  slug: 'nanny-app',
  scheme: 'nanny-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#fcf9f7',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.nannyapp.mobile',
    googleServicesFile: "./GoogleService-Info.plist",
    // Standard HTTPS/Firebase only — exempt encryption. Setting this stops
    // TestFlight/App Store Connect asking the export-compliance question on
    // every build.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Firebase phone auth verifies the app on iOS with a SILENT background
      // push (not the reCAPTCHA web flow). That silent push only arrives if the
      // app declares the remote-notification background mode AND carries the
      // aps-environment entitlement (below). Without these, iOS can't deliver
      // the verification push and Firebase falls back to reCAPTCHA — which then
      // can't complete because the redirect scheme isn't wired for it.
      UIBackgroundModes: ['remote-notification'],
    },
    // Push Notifications capability. Required for the FCM token AND for Firebase
    // phone auth's silent app-verification push. 'production' is the APNs
    // environment TestFlight / App Store builds use; EAS enables the matching
    // capability on the App ID and regenerates the provisioning profile.
    entitlements: {
      'aps-environment': 'production',
    },
    // Deliberately no `config.googleMapsApiKey` here. Setting it pulls in the
    // react-native-google-maps pod, which cannot build under the framework
    // linkage Firebase requires (react-native-maps#4868, #5742 -- unresolved
    // upstream). Nothing is lost: no screen passes PROVIDER_GOOGLE, so
    // react-native-maps already renders Apple Maps on iOS and the pod was
    // being compiled but never used. Android still uses Google Maps below.
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    package: 'com.nannyapp.mobile',
    googleServicesFile: "./google-services.json",
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    config: {
      googleMaps: {
        apiKey: GOOGLE_MAPS_API_KEY,
      },
    },
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: `${APP_NAME} needs your location to find nearby nannies.` }],
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-firebase/messaging",
    "@react-native-community/datetimepicker",
    [
      'expo-image-picker',
      {
        photosPermission: `${APP_NAME} needs access to your photos so you can set a profile picture or attach evidence to care log entries.`,
        cameraPermission: `${APP_NAME} needs access to your camera so you can attach photo evidence to care log entries.`,
      },
    ],
    // Firebase's Swift pods cannot be integrated as static libraries, so iOS
    // needs framework linkage. This and withIosFirebasePods are two halves of
    // one fix and must stay together -- see that plugin for the full story.
    // android.minSdkVersion 26: react-native-vlc-media-player (live camera
    // monitor) declares minSdk 26, and the manifest merger refuses to build an
    // app whose floor (Expo's default 24) is lower than a library's. Raising it
    // drops Android 7.x — required to ship VLC, which has no lower-floor release.
    ['expo-build-properties', { android: { minSdkVersion: 26 }, ios: { useFrameworks: 'static' } }],
    './plugins/withIosFirebasePods',
    // RTSP playback for the parent's live camera monitor. libVLC handles RTSP
    // on both platforms; AVPlayer (expo-video/react-native-video) cannot play
    // RTSP on iOS at all, which is why this is a native module rather than a
    // JS-only addition. Requires a fresh dev/EAS build — it will not arrive
    // over an OTA update.
    'react-native-vlc-media-player',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Production / fallback URL. In dev, api.ts derives the host from Metro's
    // hostUri so it stays in sync with the IP printed at startup.
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'https://backend-beige-nine-55.vercel.app',
    currencyCode: process.env['CURRENCY_CODE'] ?? 'EGP',
    // Google Places / Geocoding key — read by src/lib/googlePlaces.ts.
    googlePlacesApiKey: GOOGLE_PLACES_API_KEY,
    // Firebase JS SDK config (client credentials — safe to ship in the app).
    // These are only used when running under Expo Go, which can't load the
    // native @react-native-firebase modules. In a native/dev-client build,
    // @react-native-firebase auto-initializes from google-services.json /
    // GoogleService-Info.plist and this extra block is ignored.
    firebaseApiKey: process.env['FIREBASE_API_KEY'] ?? 'AIzaSyC3eB2qrs8KVEPu5ny8J9sBAPcLbvWnuL8',
    firebaseAuthDomain: process.env['FIREBASE_AUTH_DOMAIN'] ?? 'nanny-now-d8518.firebaseapp.com',
    firebaseProjectId: process.env['FIREBASE_PROJECT_ID'] ?? 'nanny-now-d8518',
    firebaseAppId: process.env['FIREBASE_APP_ID'] ?? '1:936472549582:android:eef4d3c4ad112865eb589f',
    firebaseStorageBucket: process.env['FIREBASE_STORAGE_BUCKET'] ?? 'nanny-now-d8518.firebasestorage.app',
    firebaseMessagingSenderId: process.env['FIREBASE_MESSAGING_SENDER_ID'] ?? '936472549582',
    // Points the Firebase JS SDK at the local Auth emulator for end-to-end
    // tests. Unset in every real build, in which case lib/firebase.ts leaves
    // auth alone. From an Android emulator the host machine is 10.0.2.2, so
    // this is typically FIREBASE_AUTH_EMULATOR_HOST=10.0.2.2:9099.
    firebaseAuthEmulatorHost: process.env['FIREBASE_AUTH_EMULATOR_HOST'] ?? '',
    // Where the Paymob checkout WebView loads from. Empty in every real build,
    // in which case paymobCheckout.ts uses Paymob's own host. End-to-end runs
    // set it to the local Paymob fake — from an Android emulator the host
    // machine is 10.0.2.2, so typically PAYMOB_CHECKOUT_ORIGIN=http://10.0.2.2:4010.
    paymobCheckoutOrigin: process.env['PAYMOB_CHECKOUT_ORIGIN'] ?? '',
    eas: {
      projectId: 'cd5987c1-9302-4742-b278-97926265980c',
    },
  },
};

export default config;
