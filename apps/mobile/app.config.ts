import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'NannyApp',
  slug: 'nanny-app',
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
    googleServicesFile: "./GoogleService-Info.plist"
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    package: 'com.nannyapp.mobile',
    googleServicesFile: "./google-services.json",
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    'expo-router',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'NannyApp needs your location to find nearby nannies.' }],
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-community/datetimepicker"
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // TODO: Pull from env vars via expo-constants
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'http://localhost:3000',
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
    // Dev-only escape hatch: the Firebase JS SDK cannot do real phone auth on
    // React Native (needs a RecaptchaVerifier that only exists in browsers),
    // so the firebase.ts shim fakes success when running in Expo Go. Users
    // type this code in the OTP screen to "pass" verification. Must match
    // the "Phone numbers for testing" entry in Firebase Console so the same
    // code also works on a future native build.
    expoGoTestPhoneCode: process.env['EXPO_GO_TEST_PHONE_CODE'] ?? '123456',
  },
};

export default config;
