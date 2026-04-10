import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingHorizontal: screenPadding,
    paddingBottom: 120,
    gap: spacing['3xl'],
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
  headerTitle: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Nanny info
  nannySection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  nannyPhoto: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceMuted,
  },
  nannyName: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  // Star rating
  starsSection: {
    alignItems: 'center',
    gap: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  starButton: {
    padding: spacing.xs,
  },
  ratingLabel: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Review text
  reviewSection: {
    gap: spacing.sm,
  },
  reviewLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  reviewInput: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    height: 140,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  charCount: {
    ...typeScale.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },

  // Photo upload
  photoSection: {
    gap: spacing.md,
  },
  photoLabel: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  addPhotoButton: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.taupe,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.taupeLight,
  },
  photoThumbnail: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surfaceMuted,
  },

  // Submit
  submitButton: {
    height: 56,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  submitButtonText: {
    ...typeScale.labelLg,
    fontFamily: fontFamily.bold,
    color: colors.white,
  },
});
