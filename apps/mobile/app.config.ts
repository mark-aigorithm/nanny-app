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
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
    package: 'com.nannyapp.mobile',
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
  },
  plugins: [
    'expo-router',
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'NannyApp needs your location to find nearby nannies.' }],
  ],
  extra: {
    // TODO: Pull from env vars via expo-constants
    apiBaseUrl: process.env['API_BASE_URL'] ?? 'http://localhost:3000',
    firebaseProjectId: process.env['FIREBASE_PROJECT_ID'] ?? '',
  },
};

export default config;
