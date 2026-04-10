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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 144,
    paddingBottom: 96,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.taupeHeader,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    ...typeScale.headingMd,
    letterSpacing: -0.45,
    color: colors.primary,
  },
  headerAvatarBorder: {
    width: 32,
    height: 32,
    borderRadius: spacing.lg,
    borderWidth: 2,
    borderColor: 'rgba(151, 165, 145, 0.2)',
    overflow: 'hidden',
    padding: spacing.xxs,
  },
  headerAvatar: {
    flex: 1,
    borderRadius: borderRadius.lg,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.sm,
    gap: spacing['3xl'],
  },
  tabItem: {
    paddingBottom: spacing.sm,
    position: 'relative',
    alignItems: 'center',
  },
  tabText: {
    ...typeScale.labelMd,
    color: colors.textMuted,
  },
  tabTextActive: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  seeAll: {
    ...typeScale.labelMd,
    color: colors.primaryDark,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: screenPadding,
    ...shadows.sm,
    gap: spacing.md,
  },
  feedSection: {
    gap: spacing['2xl'],
  },

  // Author row
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.warmBorder,
  },
  avatar: {
    width: 40,
    height: 40,
  },
  authorInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  authorName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  authorTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  proBadge: {
    backgroundColor: colors.goldWarm,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  proBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Post content
  postBody: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 26,
  },
  postImageContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  postImage: {
    width: '100%',
    height: 165,
  },

  // Tags
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // Actions
  divider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(240, 237, 235, 0.5)',
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xl'],
    paddingTop: spacing.xs,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    ...typeScale.labelSm,
    color: colors.textMuted,
  },
  actionSpacer: {
    flex: 1,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: screenPadding,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 5,
  },

});
