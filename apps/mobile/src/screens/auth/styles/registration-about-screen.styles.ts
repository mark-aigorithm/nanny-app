import { StyleSheet } from 'react-native';

import { borderRadius, colors, fontFamily, spacing, typeScale } from '@mobile/theme';
import { wizardBase } from './registration-wizard.styles';

export const styles = StyleSheet.create({
  ...wizardBase,

  // Photo picker
  photoSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarCircleError: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
  // Matches TextInputField's own error line.
  fieldErrorText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.error,
  },
  verifiedHint: {
    ...typeScale.bodySm,
    color: colors.successText,
    marginTop: -spacing.sm,
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
  dateFieldError: {
    borderWidth: 1,
    borderColor: colors.error,
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
  iosDatePicker: {
    height: 216,
    backgroundColor: colors.background,
  },
});
