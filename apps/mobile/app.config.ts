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
    'expo-secure-store',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'NannyApp needs your location to find nearby nannies.' }],
    "@react-native-firebase/app",
    "@react-native-firebase/auth",
    "@react-native-community/datetimepicker",
    [
      'expo-image-picker',
      {
        photosPermission: 'NannyApp needs access to your photos so you can set a profile picture.',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Points at the laptop's LAN IP so the iPhone (on the same Wi-Fi) can
    // actually reach it. `localhost` on the phone means the phone itself.
    // The IP must match whatever Metro prints at startup ("Metro waiting
    // on exp://192.168.x.x:8081"). Update this value when your DHCP lease
    // changes, or override via the API_BASE_URL env var.
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'http://192.168.1.11:3000',
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
    // Set OTP_BYPASS_ENABLED=true in your shell to skip phone OTP during local dev.
    // Uses email/password Firebase auth instead — still creates a real Firebase user
    // and a real JWT, so the backend registration path works end-to-end.
    // Never enable in production (env var is not set there).
    otpBypassEnabled: process.env['OTP_BYPASS_ENABLED'] ?? 'false',
  },
};

export default config;
