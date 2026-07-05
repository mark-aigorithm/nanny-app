import { Platform, StatusBar } from 'react-native';

import { spacing } from './spacing';

export const STATUS_BAR_HEIGHT =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

export const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

export const BOTTOM_NAV_HEIGHT = 80;

export const PARENT_TAB_SEARCH_BAR_HEIGHT = 48;

export const PARENT_TAB_SEARCH_STRIP_HEIGHT =
  spacing.md + PARENT_TAB_SEARCH_BAR_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP = HEADER_HEIGHT + spacing.lg;

export const PARENT_TAB_CONTENT_TOP_WITH_SEARCH =
  HEADER_HEIGHT + PARENT_TAB_SEARCH_STRIP_HEIGHT;

export const PARENT_TAB_SCROLL_BOTTOM = BOTTOM_NAV_HEIGHT + spacing.lg + 16;

export const PARENT_TAB_FAB_BOTTOM = BOTTOM_NAV_HEIGHT + spacing.lg;
