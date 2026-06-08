import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    backgroundColor: colors.background,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  postButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  postButtonDisabled: {
    backgroundColor: colors.neutralLight,
  },
  postButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },

  fieldGroup: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  fieldLabel: {
    ...typeScale.labelSm,
    color: colors.textDark,
  },
  fieldOptional: {
    ...typeScale.caption,
    color: colors.textMuted,
    fontWeight: '400',
  },

  typeChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  typeChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    backgroundColor: colors.surface,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  typeChipTextActive: {
    color: colors.white,
  },

  textInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    ...typeScale.bodyMd,
    color: colors.textDark,
  },
  textArea: {
    minHeight: 96,
    maxHeight: 160,
    textAlignVertical: 'top',
    paddingTop: spacing.md,
  },

  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  selectFieldText: {
    ...typeScale.bodyMd,
    color: colors.textDark,
    flex: 1,
  },

  numberRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  numberField: {
    flex: 1,
    gap: spacing.sm,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
  },
  pricePrefix: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    marginRight: spacing.xs,
  },
  numberInputIcon: {
    marginRight: spacing.xs,
  },
  priceInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    ...typeScale.bodyMd,
    color: colors.textDark,
  },

  imagePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderStyle: 'dashed',
  },
  imagePickerText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  imagePreviewWrap: {
    position: 'relative',
  },
  imagePreview: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
  },
  imagePreviewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tagsContainer: {
    gap: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceMuted,
  },
  tagChipActive: {
    backgroundColor: colors.taupe,
  },
  tagChipText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  tagChipTextActive: {
    color: colors.textTertiary,
    fontFamily: fontFamily.semiBold,
  },
});
