import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_CONTENT_HEIGHT = 56;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: screenPadding,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: colors.background,
  },
  brandText: {
    ...typeScale.headingMd,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['3xl'],
    gap: screenPadding,
  },
  stepLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  title: {
    fontFamily: fontFamily.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.taupe,
    gap: spacing.sm,
  },
});
