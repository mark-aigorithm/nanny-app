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
    paddingBottom: 100,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },

  // Filter chips
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
  },
  filterChipTextActive: {
    color: colors.white,
  },

  // Request cards
  requestsList: {
    gap: spacing.lg,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadows.sm,
  },

  // Parent info row
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  parentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
  },
  parentInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  parentName: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
  requestedAt: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  amountBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  amountText: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },

  // Details
  detailsGrid: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  // Special instructions
  instructionsBox: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  instructionsLabel: {
    ...typeScale.captionBold,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  instructionsText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },

  // Action buttons
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  declineButton: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    ...typeScale.labelMd,
    color: colors.error,
  },
  acceptButton: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  acceptButtonText: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },

  // Status badges
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusAccepted: {
    backgroundColor: colors.successLight,
  },
  statusDeclined: {
    backgroundColor: colors.errorLight,
  },
  statusText: {
    ...typeScale.captionBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statusAcceptedText: {
    color: colors.successDark,
  },
  statusDeclinedText: {
    color: colors.error,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.md,
  },
  emptyStateText: {
    ...typeScale.bodyLg,
    fontFamily: fontFamily.medium,
    color: colors.textMuted,
  },
});
