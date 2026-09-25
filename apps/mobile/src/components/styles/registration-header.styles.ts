import { StyleSheet } from 'react-native';

import {
  colors,
  typeScale,
  spacing,
  REGISTRATION_PROGRESS_HEIGHT,
  REGISTRATION_TITLE_ROW_HEIGHT,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  // Overlays the top of the screen; the screen pads its scroll content by
  // REGISTRATION_HEADER_HEIGHT to start below it.
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: colors.background,
  },
  titleRow: {
    height: STATUS_BAR_HEIGHT + REGISTRATION_TITLE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    textAlign: 'center',
    flex: 1,
  },
  spacer: {
    width: 36,
  },
  progressTrack: {
    height: REGISTRATION_PROGRESS_HEIGHT,
    backgroundColor: colors.taupe,
  },
  progressFill: {
    height: REGISTRATION_PROGRESS_HEIGHT,
    backgroundColor: colors.primary,
    borderRadius: REGISTRATION_PROGRESS_HEIGHT / 2,
  },
});
