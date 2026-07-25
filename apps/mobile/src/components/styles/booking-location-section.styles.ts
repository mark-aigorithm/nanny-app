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
} from '@mobile/theme';

export const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  // Saved-home confirmation card: map thumbnail + address + change link.
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  mapPreview: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.taupeLight,
  },
  previewMap: {
    flex: 1,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  cardLabel: {
    ...typeScale.caption,
    color: colors.textMuted,
  },
  cardAddress: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
  },
  changeLink: {
    ...typeScale.labelSm,
    color: colors.primaryDark,
  },

  // Fallback when no home is on file yet (legacy accounts).
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySub: {
    ...typeScale.caption,
    color: colors.textMuted,
  },

  // Change-location modal.
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenPadding,
    paddingTop: STATUS_BAR_HEIGHT,
    height: 64 + STATUS_BAR_HEIGHT,
  },
  modalIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: fontFamily.extraBold,
    fontSize: 18,
    letterSpacing: -0.45,
    color: colors.textPrimary,
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  modalHint: {
    ...typeScale.bodySm,
    color: colors.textSecondary,
  },
  modalFooter: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
    backgroundColor: colors.background,
  },
});
