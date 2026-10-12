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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  headerButtonActive: {
    backgroundColor: colors.taupe,
  },

  // Filters (or the search field), between the header and the feed.
  toolbar: {
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.warmBorder,
  },
  filterRow: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warmBorder,
  },
  filterPillActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  filterPillText: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  filterPillTextActive: {
    color: colors.white,
  },
  searchBar: {
    marginHorizontal: screenPadding,
  },

  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingHorizontal: screenPadding,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listGap: {
    height: spacing.lg,
  },

  // "My posts" entry at the top of every filter
  myPostsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primaryMuted,
  },
  myPostsIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myPostsText: {
    flex: 1,
    minWidth: 0,
  },
  myPostsTitle: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  myPostsSubtitle: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  loadingIndicator: {
    marginTop: spacing['3xl'],
  },
  footerLoader: {
    marginVertical: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  emptyCtaText: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },
});
