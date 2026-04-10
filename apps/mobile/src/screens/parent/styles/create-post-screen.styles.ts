import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
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

  // ── Scroll content ──────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },

  // ── Post type selector ──────────────────────────────────────────────────────
  sectionLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
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

  // ── Text input area ─────────────────────────────────────────────────────────
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    minHeight: 160,
    ...typeScale.bodyLg,
    color: colors.textDark,
    textAlignVertical: 'top',
    ...shadows.sm,
  },

  // ── Image picker row ────────────────────────────────────────────────────────
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderStyle: 'dashed',
  },
  imagePickerText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  imagePreview: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceMuted,
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

  // ── Tag selector ────────────────────────────────────────────────────────────
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
