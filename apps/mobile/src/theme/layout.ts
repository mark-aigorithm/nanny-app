import { Platform, StatusBar } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { spacing } from './spacing';

/**
 * The top safe area — status bar, notch, Dynamic Island, punch-hole camera —
 * as the device reports it at launch. It is a constant (the app is
 * portrait-only, and nothing changes the top inset at runtime), so styles can
 * use it. Never a per-platform guess: it is 20 on an iPhone SE, 59 under a
 * Dynamic Island, and varies across Android cutouts. The fallback only covers
 * a launch where native metrics were not ready, and tests.
 */
export const STATUS_BAR_HEIGHT =
  initialWindowMetrics?.insets.top ||
  (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44);

export const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

export const BOTTOM_NAV_HEIGHT = 80;

/** The registration wizard's title row, under the status bar. */
export const REGISTRATION_TITLE_ROW_HEIGHT = Platform.OS === 'ios' ? 44 : 56;

/** The wizard's progress bar, under the title row. */
export const REGISTRATION_PROGRESS_HEIGHT = 6;

/**
 * Everything `RegistrationHeader` overlays at the top of a wizard screen; the
 * screen's scroll content starts this far down.
 */
export const REGISTRATION_HEADER_HEIGHT =
  STATUS_BAR_HEIGHT + REGISTRATION_TITLE_ROW_HEIGHT + REGISTRATION_PROGRESS_HEIGHT;

/**
 * How far the parent floating pill tab bar reaches above the bottom safe area:
 * its offset (spacing.md) + the pill itself (~76). It sits on top of the
 * system's bottom bar, whose height varies by device and setting, so screens
 * never use this directly — `useFloatingNavClearance()` adds the live inset,
 * and swaps the pill estimate for its measured height once it has laid out.
 * Not BOTTOM_NAV_HEIGHT, which is the nanny bar's in-flow height.
 */
export const FLOATING_NAV_HEIGHT = spacing.md + 76;

export const PARENT_TAB_SEARCH_BAR_HEIGHT = 48;

export const PARENT_TAB_SEARCH_STRIP_HEIGHT =
  spacing.md + PARENT_TAB_SEARCH_BAR_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP = HEADER_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP_WITH_SEARCH =
  HEADER_HEIGHT + PARENT_TAB_SEARCH_STRIP_HEIGHT;
