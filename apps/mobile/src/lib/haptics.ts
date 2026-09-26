import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Light haptic ticks for taps. Fire-and-forget: a device without a haptic
 * engine (or the web preview) simply gets nothing, never an error.
 */

/** A soft tap — primary actions (book, confirm, pay). */
export function hapticTap(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A selection tick — switching tabs, toggling chips and segments. */
export function hapticSelect(): void {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}
