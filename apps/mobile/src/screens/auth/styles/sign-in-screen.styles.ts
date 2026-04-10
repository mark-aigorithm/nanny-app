import { StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing } from '@mobile/theme';

export const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Blobs
  blobTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.warmBorder,
    opacity: 0.35,
  },
  blobBottomRight: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.primary,
    opacity: 0.15,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: 80,
    paddingBottom: spacing['4xl'],
    gap: spacing['3xl'],
  },

  // Header
  header: {
    gap: spacing.sm,
  },
  headline: {
    ...typeScale.displayMd,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyLg,
    color: colors.textSecondary,
  },

  // Form
  form: {
    gap: spacing.xl,
  },
  fieldGroup: {
    gap: spacing.sm,
  },

  // Password meta row
  passwordMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
  },
  forgotLink: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Social buttons
  socialButtons: {
    gap: spacing.md,
  },
  socialButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.taupe,
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textSecondary,
  },
  footerLink: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.primaryDark,
  },
});
