import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, shadows } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.background,
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['3xl'],
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
  },

  // Background decorative blobs
  blobTopLeft: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.warmBorder,
    opacity: 0.35,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.2,
  },

  // Center content
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2xl'],
  },
  typographyCluster: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  appName: {
    ...typeScale.displayLg,
    color: colors.textPrimary,
    lineHeight: 32,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 0,
  },
  paginationDots: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['4xl'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warmBorder,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  getStartedButton: {
    backgroundColor: colors.primaryDark,
    ...shadows.sm,
  },
});
