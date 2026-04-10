import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingBottom: 128,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Page title
  pageTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  // Live Chat Card
  liveChatCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.md,
  },
  liveChatLeft: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  liveChatTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 26,
    color: colors.white,
  },
  liveChatSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.8)',
  },
  startChatBtn: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    height: 36,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  startChatBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primary,
  },

  // FAQ Search Bar
  searchBar: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    height: 56,
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 19,
    zIndex: 1,
  },
  searchInput: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textDark,
    paddingLeft: spacing['4xl'],
    paddingRight: spacing.lg,
    height: '100%',
  },

  // FAQ Accordion
  faqList: {
    gap: spacing.md,
  },
  faqItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  faqQuestion: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textDark,
    flex: 1,
    marginRight: spacing.md,
  },
  faqQuestionExpanded: {
    fontWeight: '700',
  },
  faqQuestionCollapsed: {
    fontWeight: '500',
  },
  faqBody: {
    backgroundColor: 'rgba(227,213,202,0.3)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  faqAnswer: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textDark,
  },

  // Other Ways to Reach Us
  otherWaysSection: {
    gap: spacing.lg,
  },
  otherWaysHeader: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.65,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  contactGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  contactCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  contactIconWrapGreen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactIconWrapBeige: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warmBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textDark,
  },
  contactSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
  },

  // Emergency Card
  emergencyCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.xl,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emergencyLeft: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  emergencyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.error,
  },
  emergencySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDark,
  },
  callNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  callNowText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.error,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.8)',
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.lg,
  },
  logoText: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceMuted,
  },
});
