/**
 * Minimal web stub for expo-constants used during Vite preview builds.
 *
 * The real package pulls in expo-modules-core, whose TypeScript declaration
 * files break the preview bundle. Screens only read `expoConfig.extra`, so a
 * plain object with the app's preview-relevant defaults is enough.
 */
const Constants = {
  expoConfig: {
    extra: {
      currencyCode: 'EGP',
    },
  },
};

export default Constants;
