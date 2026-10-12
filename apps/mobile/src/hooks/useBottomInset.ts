import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, FLOATING_NAV_HEIGHT } from '@mobile/theme';
import { useFloatingNavStore } from '@mobile/store/floatingNavStore';

/*
 * The app draws edge-to-edge, so the system's bottom bar — Android's 3-button
 * bar or gesture handle, the iPhone home indicator — lies on top of it. Its
 * height is not a per-platform constant: it is 0 when the bar is hidden, grows
 * when the user switches to buttons, and changes live while the app runs. It is
 * only ever read from the device here, never guessed with `Platform.OS`.
 */

/**
 * Bottom padding for anything pinned to the bottom edge — a sticky CTA footer,
 * a bottom sheet, a composer. `minimum` is the padding it wants when nothing
 * covers the edge; when the system bar is there, the content clears it with a
 * small gap instead.
 */
export function useBottomBarPadding(minimum: number = spacing['2xl']): number {
  const { bottom } = useSafeAreaInsets();
  return Math.max(minimum, bottom + spacing.sm);
}

/**
 * How far up from the screen's bottom edge the parent floating tab bar
 * reaches. Content that scrolls under it pads its end with this plus room to
 * breathe; anything floating over it (a FAB) sits above it. Uses the bar's
 * measured height once it has laid out — it grows with the OS font size, and a
 * FAB placed by the estimate sat on top of it on phones with large text.
 */
export function useFloatingNavClearance(): number {
  const { bottom } = useSafeAreaInsets();
  const pillHeight = useFloatingNavStore((s) => s.pillHeight);
  const estimate = FLOATING_NAV_HEIGHT - spacing.md;
  return bottom + spacing.md + Math.max(estimate, pillHeight ?? 0);
}
