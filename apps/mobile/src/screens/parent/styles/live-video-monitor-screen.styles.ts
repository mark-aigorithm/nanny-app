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
    paddingBottom: 40,
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  backBtn: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  settingsBtn: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Video Player
  videoContainer: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    aspectRatio: 342 / 256.5,
  },
  videoFeed: {
    width: '100%',
    height: '100%',
  },
  liveBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.error,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    ...shadows.md,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.white,
  },
  liveText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.white,
    letterSpacing: 0.5,
  },
  cameraSelector: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  cameraSelectorText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  statusBar: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDot: {
    width: spacing.sm,
    height: spacing.sm,
    borderRadius: spacing.xs,
    backgroundColor: colors.liveGreen,
  },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.white,
  },
  qualityRow: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qualityText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.white,
  },
  fullscreenBtn: {
    backgroundColor: colors.overlay,
    width: spacing['3xl'],
    height: spacing['3xl'],
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Awareness Banner
  awarenessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  awarenessText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },

  // Controls Grid
  controlsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  controlBtn: {
    flex: 1,
    height: 72,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.taupe,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  controlLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },

  // Timer Row
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timerText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  timerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  historyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
  },
  stopIcon: {
    width: spacing.md,
    height: spacing.md,
    borderRadius: 2,
    backgroundColor: colors.white,
  },
  stopBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },

  // Recent Activity
  activitySection: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  activityHeading: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderLeftWidth: 4,
    ...shadows.sm,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  activityIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTextCol: {
    flex: 1,
    gap: spacing.xxs,
  },
  activityTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  activitySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
});
