import { Platform, StatusBar } from 'react-native';

export const STATUS_BAR_HEIGHT =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44;

export const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 56;

export const BOTTOM_NAV_HEIGHT = 80;
