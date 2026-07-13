import { StyleSheet } from 'react-native';

import { colors, spacing, typeScale, borderRadius as br, shadows } from '@mobile/theme';

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

  // Hero balance card
  hero: {
    backgroundColor: colors.warmLight,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'flex-start',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  heroBadge: {
    width: 34,
    height: 34,
    borderRadius: br.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  heroLabel: {
    ...typeScale.labelMd,
    color: colors.textSecondary,
  },
  heroBalance: {
    ...typeScale.displayLg,
    color: colors.textPrimary,
  },
  heroConversion: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  // How it works
  infoCard: {
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoText: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    flex: 1,
  },

  // Activity section
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

  // History rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  rowReason: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
    marginTop: 1,
  },
  rowDate: {
    ...typeScale.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  rowPoints: {
    ...typeScale.labelLg,
  },
  pointsPos: {
    color: colors.successDark,
  },
  pointsNeg: {
    color: colors.error,
  },

  loadMore: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadMoreText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },
});
