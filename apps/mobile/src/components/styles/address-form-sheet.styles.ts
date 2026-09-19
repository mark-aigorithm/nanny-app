import { StyleSheet } from 'react-native';

import { colors, fontFamily, spacing, screenPadding, STATUS_BAR_HEIGHT } from '@mobile/theme';

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT,
    height: 64 + STATUS_BAR_HEIGHT,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.extraBold,
    fontSize: 18,
    letterSpacing: -0.45,
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing['4xl'],
  },
});
