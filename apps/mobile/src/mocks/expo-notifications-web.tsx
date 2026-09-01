/**
 * Web stub for `expo-notifications`.
 *
 * Same reason as the messaging stub: `usePushNotifications` reaches for it
 * behind a lazy `require`, the bundler resolves it anyway, and it pulls in
 * `expo-modules-core`, whose `.ts` declaration files fail to bundle. Any
 * screen importing `useAuth` pulls this in transitively.
 */
export const AndroidImportance = { MAX: 5 };

export async function getPermissionsAsync() {
  return { status: 'granted' as const, granted: true };
}

export async function requestPermissionsAsync() {
  return { status: 'granted' as const, granted: true };
}

export async function getExpoPushTokenAsync() {
  return { data: '' };
}

export async function setNotificationChannelAsync() {
  return undefined;
}

export function setNotificationHandler() {
  return undefined;
}

export function addNotificationReceivedListener() {
  return { remove: () => undefined };
}

export function addNotificationResponseReceivedListener() {
  return { remove: () => undefined };
}

export async function getLastNotificationResponseAsync() {
  return null;
}
