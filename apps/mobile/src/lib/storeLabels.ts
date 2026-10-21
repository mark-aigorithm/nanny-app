import { Platform } from 'react-native';

/** The update button names where it goes (the blocker and the optional sheet share it). */
export const UPDATE_IN_STORE_LABEL =
  Platform.OS === 'ios' ? 'Update in the App Store' : 'Update on Google Play';

/** Shown when the store link won't open, so the blocker is never a dead end. */
export const storeLinkFallback = (storeUrl: string) =>
  `We couldn't open the store. Update from this link: ${storeUrl}`;
