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
  publishHeaderButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  publishHeaderButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.xl,
  },

  // ── Image placeholder ───────────────────────────────────────────────────────
  imagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderStyle: 'dashed',
    gap: spacing.sm,
  },
  imagePlaceholderText: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },

  // ── Form fields ─────────────────────────────────────────────────────────────
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  fieldInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  fieldInputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    gap: spacing.sm,
  },
  fieldInputIconText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
  },
  descriptionInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    minHeight: 120,
    textAlignVertical: 'top',
  },

  // ── Age range chips ─────────────────────────────────────────────────────────
  ageRangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  ageChip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    backgroundColor: colors.surface,
  },
  ageChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ageChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  ageChipTextActive: {
    color: colors.white,
  },

  // ── Capacity ────────────────────────────────────────────────────────────────
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  capacityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  capacityValue: {
    ...typeScale.headingMd,
    color: colors.textDark,
    minWidth: 40,
    textAlign: 'center',
  },

  // ── Publish button ──────────────────────────────────────────────────────────
  publishButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
    ...shadows.md,
  },
  publishButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 0.5,
  },
});
