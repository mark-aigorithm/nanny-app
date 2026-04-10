import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingVertical: 63,
  },

  // Success Indicator
  successSection: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heading: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typeScale.bodyLg,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Booking Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: screenPadding,
    width: '100%',
    ...shadows.lg,
  },

  // Nanny Header
  nannyHeader: {
    alignItems: 'center',
  },
  photoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  nannyPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  nannyName: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  verifiedText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(229,226,224,0.5)',
    marginVertical: screenPadding,
  },

  // Details List
  detailsList: {
    gap: spacing.lg,
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
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  detailValue: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Action Buttons
  actions: {
    width: '100%',
    paddingTop: spacing['3xl'],
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius['2xl'],
    height: 56,
  },
  primaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warmBorder,
    borderRadius: borderRadius['2xl'],
    height: 56,
    marginTop: spacing.md,
  },
  secondaryButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.textTertiary,
  },

  // Back Link
  backLink: {
    paddingTop: 40,
    alignItems: 'center',
  },
  backLinkText: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
});
