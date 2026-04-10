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
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    paddingBottom: 140,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Status badge
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusConfirmed: {
    backgroundColor: colors.successLight,
  },
  statusCompleted: {
    backgroundColor: colors.taupe,
  },
  statusCancelled: {
    backgroundColor: colors.errorLight,
  },
  statusPending: {
    backgroundColor: colors.taupeLight,
  },
  statusText: {
    ...typeScale.captionBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusTextConfirmed: {
    color: colors.successDark,
  },
  statusTextCompleted: {
    color: colors.textMuted,
  },
  statusTextCancelled: {
    color: colors.error,
  },
  statusTextPending: {
    color: colors.textTertiary,
  },

  // Nanny card
  nannyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  nannyPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
  },
  nannyInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  nannyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },

  // Details section
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailLabel: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },
  detailValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },

  // Special instructions
  instructionsCard: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  instructionsLabel: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  instructionsText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Payment summary
  paymentCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  paymentValue: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  paymentDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.taupeLight,
  },
  paymentTotalLabel: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  paymentTotalValue: {
    ...typeScale.headingSm,
    color: colors.primary,
  },

  // Actions
  actionsSection: {
    gap: spacing.md,
  },
  cancelButton: {
    height: 48,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
  rescheduleButton: {
    height: 48,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescheduleButtonText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
  messageButton: {
    height: 48,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  messageButtonText: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
