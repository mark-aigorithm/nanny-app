import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  BOTTOM_NAV_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT_LOCAL = 100;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    gap: spacing.xs,
  },
  locationText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textTertiary,
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

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT_LOCAL,
    paddingBottom: BOTTOM_NAV_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },

  // Filter Chips
  chipsScroll: {
    marginBottom: spacing.xl,
    marginHorizontal: -screenPadding,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
  },
  chip: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: colors.taupe,
  },
  chipText: {
    ...typeScale.labelSm,
  },
  chipTextActive: {
    color: colors.white,
  },
  chipTextInactive: {
    color: colors.textTertiary,
  },

  // Event Cards
  cardsContainer: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    shadowColor: colors.textMuted,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 3,
    overflow: 'hidden',
  },
  cardImageContainer: {
    height: 180,
    overflow: 'hidden',
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  dateBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.error,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dateBadgeMonth: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateBadgeDay: {
    ...typeScale.headingMd,
    color: colors.white,
    lineHeight: 22,
  },
  bookmarkButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card Body
  cardBody: {
    padding: spacing.lg,
    gap: 10,
  },
  cardTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // Tags
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  tagText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textTertiary,
  },

  // Spots Left
  spotsLeftBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.warmLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
  },
  spotsLeftText: {
    ...typeScale.captionBold,
    color: colors.error,
  },

  // Attendees
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatarWrapper: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
  },
  attendeeAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.lg,
  },
  goingText: {
    ...typeScale.labelSm,
    color: colors.textTertiary,
    flex: 1,
  },

  // Join Button
  joinButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  joinButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.white,
  },

  // Peeking Card
  peekingCard: {
    height: 80,
    backgroundColor: colors.neutralLight,
    borderRadius: borderRadius.xl,
    opacity: 0.6,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    right: screenPadding,
    bottom: BOTTOM_NAV_HEIGHT + spacing['2xl'],
    alignItems: 'center',
    zIndex: 5,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  fabLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    color: colors.primary,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
});
