import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
  borderRadius,
} from '@mobile/theme';

const HEADER_CONTENT_HEIGHT = 56;

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: STATUS_BAR_HEIGHT,
    paddingHorizontal: spacing.lg,
    height: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    ...typeScale.headingMd,
    color: colors.primary,
    letterSpacing: -0.5,
  },

  // Mini progress (right side of header)
  miniProgressTrack: {
    width: 96,
    height: 6,
    backgroundColor: colors.taupe,
    borderRadius: 3,
  },
  miniProgressFill: {
    width: '88%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Full-width progress bar below header
  progressBarTrack: {
    position: 'absolute',
    top: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 100,
    height: 6,
    backgroundColor: colors.taupe,
  },
  progressBarFill: {
    width: '88%',
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 3,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: STATUS_BAR_HEIGHT + HEADER_CONTENT_HEIGHT + 6 + screenPadding,
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: screenPadding,
  },

  // Step label
  stepLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },

  // Section title (big headline)
  sectionTitle: {
    fontFamily: fontFamily.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  // Upload cards group
  uploadGroup: {
    gap: spacing.md,
  },

  // A single upload card (empty state)
  uploadCard: {
    borderWidth: 1.5,
    borderColor: colors.warmBorder,
    borderStyle: 'dashed',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 160,
  },
  uploadCardFilled: {
    borderStyle: 'solid',
    borderColor: colors.primary,
    padding: 0,
    overflow: 'hidden',
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    ...typeScale.bodyMd,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
  },
  uploadHint: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },

  // Filled preview
  previewImage: {
    width: '100%',
    height: 200,
  },
  previewOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  previewOverlayText: {
    ...typeScale.labelMd,
    color: colors.white,
    fontFamily: fontFamily.bold,
  },
  previewBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  previewBadgeText: {
    ...typeScale.labelMd,
    color: colors.successText,
    fontFamily: fontFamily.bold,
  },

  errorText: {
    ...typeScale.bodySm,
    color: colors.error,
  },

  // Footer
  footer: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : screenPadding,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.taupe,
  },
});
