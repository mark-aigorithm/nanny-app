import { Platform, StyleSheet } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

import {
  borderRadius,
  colors,
  typeScale,
  spacing,
  screenPadding,
  REGISTRATION_HEADER_HEIGHT,
} from '@mobile/theme';

/**
 * The frame every registration wizard screen shares, spread into each
 * screen's own `StyleSheet.create`: a scroll area starting under
 * `RegistrationHeader`, the step label and headline, the form-level error
 * banner, and the fixed footer holding the primary button.
 */
export const wizardBase = {
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: REGISTRATION_HEADER_HEIGHT + screenPadding,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing['4xl'],
    gap: spacing['2xl'],
  },
  stepLabel: {
    ...typeScale.overline,
    letterSpacing: 0.65,
    color: colors.textMuted,
  },
  headlineGroup: {
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
  },
  formErrorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  formErrorText: {
    ...typeScale.bodyMd,
    color: colors.error,
  },
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.taupe,
  },
} satisfies Record<string, ViewStyle | TextStyle>;
