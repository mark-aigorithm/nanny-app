import { Platform, StatusBar } from 'react-native';

import { spacing } from './spacing';

export const STATUS_BAR_HEIGHT =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

export const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

export const BOTTOM_NAV_HEIGHT = 80;

/**
 * Bottom content clearance for the parent floating pill tab bar:
 * pill height (~72) + bottom offset + breathing room. Screens that scroll
 * under the floating bar pad their content with this, NOT BOTTOM_NAV_HEIGHT
 * (which remains the nanny bar's in-flow height).
 */
export const FLOATING_NAV_CLEARANCE = 112;

export const PARENT_TAB_SEARCH_BAR_HEIGHT = 48;

export const PARENT_TAB_SEARCH_STRIP_HEIGHT =
  spacing.md + PARENT_TAB_SEARCH_BAR_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP = HEADER_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP_WITH_SEARCH =
  HEADER_HEIGHT + PARENT_TAB_SEARCH_STRIP_HEIGHT;

export const PARENT_TAB_SCROLL_BOTTOM = FLOATING_NAV_CLEARANCE + spacing.lg;

// The floating pill occupies ~122px from the screen bottom on home-indicator
// devices (insets.bottom 34 + 12 offset + ~76 pill height). +spacing.sm left
// the FAB sitting ~2px under the pill, so it needs the larger clearance.
export const PARENT_TAB_FAB_BOTTOM = FLOATING_NAV_CLEARANCE + spacing.lg;
