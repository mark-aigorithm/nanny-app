import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius } from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.textPrimary,
  },

  // ── Image section (top 55%) ──────────────────────────────────────────────────
  imageSection: {
    height: '55%',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: spacing['2xl'],
    backgroundColor: 'rgba(0,0,0,0.1)', // one-off frosted-glass bg — could be added to theme
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: borderRadius.full,
    // Frosted-glass effect approximated with a semi-transparent bg
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)', // one-off frosted-glass border — could be added to theme
  },
  skipText: {
    ...typeScale.labelMd,
    color: colors.white,
    lineHeight: 20,
  },

  // ── Bottom card (bottom 45%) ─────────────────────────────────────────────────
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: spacing['3xl'],
    borderTopRightRadius: spacing['3xl'],
    paddingHorizontal: spacing['3xl'],
    paddingTop: 36,
    paddingBottom: spacing['4xl'],
    // Custom shadow — doesn't match standard shadows (negative offset, unique values)
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
    lineHeight: 36,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 26,
    color: colors.textSecondary,
    marginBottom: 28,
  },

  // Pagination dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['3xl'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warmBorder,
  },
  dotActive: {
    width: 32,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  // CTA button
  cta: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.white,
    lineHeight: 24,
  },
});
