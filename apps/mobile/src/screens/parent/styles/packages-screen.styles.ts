import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.md,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },

  // "You have {n}h prepaid" summary card
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  hoursText: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flex: 1,
  },

  // Active-package banner
  banner: {
    backgroundColor: colors.warmLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.goldWarm,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bannerText: {
    ...typeScale.bodySm,
    color: colors.textPrimary,
    flex: 1,
  },

  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },

  center: {
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['2xl'],
  },
  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  emptyBody: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Package card
  packageCard: {
    gap: spacing.sm,
  },
  packageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  packageName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    flex: 1,
  },
  packageHours: {
    ...typeScale.headingSm,
    color: colors.primaryDark,
  },
  packageDescription: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  packageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  packageMeta: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
});
