import { StyleSheet } from 'react-native';

import {
  borderRadius,
  colors,
  HEADER_HEIGHT,
  shadows,
  spacing,
  typeScale,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },

  // Deliberately minimal: extra hours are bought against a shift already in
  // progress, so repeating the nanny and booking details here is noise.
  introSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  summaryLabel: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typeScale.headingSm,
    color: colors.textPrimary,
  },
  summaryNote: {
    ...typeScale.bodySm,
    color: colors.textMuted,
  },

  webviewWrap: {
    flex: 1,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  webviewLoadingText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
  },

  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
  missingParamsText: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius['2xl'],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  retryBtnText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
});
