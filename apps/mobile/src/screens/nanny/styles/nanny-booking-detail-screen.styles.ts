import { StyleSheet } from 'react-native';
import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  loadingCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xs,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // The hero card and the chat sit together, closer than the sections below.
  top: {
    gap: spacing.md,
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
  paymentTotalLabel: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  paymentTotalValue: {
    ...typeScale.headingSm,
    color: colors.primaryDark,
  },
  paymentSubtext: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
