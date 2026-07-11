import { StyleSheet } from 'react-native';
import {
  colors,
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
    paddingBottom: spacing['4xl'],
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

  // Mother card
  motherCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  motherPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
  },
  motherInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  motherName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
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

  // Rating & review
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.sm,
  },
  reviewTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  reviewComment: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  reviewEmpty: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
});
