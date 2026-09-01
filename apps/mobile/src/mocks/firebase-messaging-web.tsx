/**
 * Web stub for `@react-native-firebase/messaging`.
 *
 * `usePushNotifications` reaches for it behind a lazy `require`, but a bundler
 * still resolves the specifier — and the real package imports
 * `react-native/Libraries/...` paths that do not exist under react-native-web,
 * so the preview build fails on it. Any screen importing `useAuth` pulls this
 * in transitively; push has nothing to show in a screenshot either way.
 */
const messaging = () => ({
  getToken: async () => '',
  deleteToken: async () => undefined,
  requestPermission: async () => 1,
  hasPermission: async () => 1,
  onMessage: () => () => undefined,
  onNotificationOpenedApp: () => () => undefined,
  getInitialNotification: async () => null,
  setBackgroundMessageHandler: () => undefined,
});

export default messaging;
