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

  // Balance hero card
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
    ...typeScale.displayMd,
    color: colors.textPrimary,
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

  // Package bucket row
  bucketCard: {
    gap: spacing.xs,
  },
  bucketHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bucketName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    flex: 1,
  },
  bucketHours: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  bucketExpiry: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Status chip
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: br.full,
  },
  statusChipText: {
    ...typeScale.captionBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
