import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
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
    width: '25%',
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

  // Photo picker
  photoSection: {
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoLink: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },

  // Form
  form: {
    gap: spacing.xl,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
  },

  // Phone row
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
  },
  countryCodeBox: {
    width: 64,
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  countryCodeText: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // Date of birth — tappable field that mirrors TextInputField visually
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  dateFieldText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  dateFieldPlaceholder: {
    color: colors.textPlaceholder,
  },

  // iOS date picker bottom-sheet modal
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 36,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  datePickerTitle: {
    ...typeScale.labelLg,
    color: colors.textPrimary,
  },
  datePickerCancel: {
    ...typeScale.labelLg,
    color: colors.textMuted,
  },
  datePickerDone: {
    ...typeScale.labelLg,
    color: colors.primaryDark,
  },

  // Inline form-level error
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
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
