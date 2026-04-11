import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
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
    width: '75%',
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
    width: '75%',
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

  // Location group
  locationGroup: {
    gap: spacing.md,
  },

  // Icon input (address)
  iconInputWrapper: {
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  iconInputInner: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // Short input (neighbourhood)
  inputShort: {
    height: 44,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },

  // Map placeholder
  mapPlaceholder: {
    height: 140,
    backgroundColor: colors.neutralLight,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section block
  sectionBlock: {
    gap: spacing.lg,
  },
  sectionHeader: {
    ...typeScale.headingMd,
    color: colors.textPrimary,
    letterSpacing: -0.9,
  },

  // Child card
  childCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  childNameInput: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  ageDropdown: {
    width: 96,
    height: 40,
    backgroundColor: 'rgba(227,213,202,0.4)',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  ageDropdownText: {
    ...typeScale.labelMd,
    color: colors.textTertiary,
  },

  // Add another child link
  addChildLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  addChildLinkText: {
    ...typeScale.labelMd,
    color: colors.primary,
  },

  // Preference chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
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
