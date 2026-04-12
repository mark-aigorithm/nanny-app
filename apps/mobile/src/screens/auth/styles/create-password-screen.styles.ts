import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 36,
  },

  // Progress bar
  progressBarTrack: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + HEADER_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 6,
    backgroundColor: colors.taupe,
  },
  progressBarFill: {
    width: '50%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_HEIGHT + 6 + screenPadding,
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: screenPadding,
  },

  // Step label
  stepLabel: {
    ...typeScale.overline,
    letterSpacing: 0.65,
    color: colors.textMuted,
  },

  // Intro
  introGroup: {
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Form
  form: {
    gap: spacing.xl,
  },

  // Requirements checklist
  requirementsCard: {
    backgroundColor: colors.taupeLight,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  requirementsTitle: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
    flex: 1,
  },
  requirementTextMet: {
    fontFamily: fontFamily.medium,
    color: colors.successDark,
  },

  // Form-level error banner
  formErrorBanner: {
    backgroundColor: colors.errorLight,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  formErrorText: {
    ...typeScale.bodyMd,
    color: colors.error,
  },

  // Footer
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.taupe,
  },
});
