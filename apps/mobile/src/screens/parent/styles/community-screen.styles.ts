import { StyleSheet } from 'react-native';
import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  screenPadding,
  borderRadius,
  PARENT_TAB_CONTENT_TOP,
  FLOATING_NAV_CLEARANCE,
  HEADER_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBar: {
    position: 'absolute',
    top: HEADER_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  filterRow: {
    paddingHorizontal: screenPadding,
    gap: spacing.sm,
  },
  filterPill: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
  },
  filterPillInactive: {
    backgroundColor: colors.taupe,
  },
  filterPillText: {
    ...typeScale.labelSm,
  },
  filterPillTextActive: {
    color: colors.white,
  },
  filterPillTextInactive: {
    color: colors.textTertiary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: HEADER_HEIGHT + spacing['3xl'] + spacing.lg + spacing.md,
    paddingBottom: FLOATING_NAV_CLEARANCE + spacing['3xl'],
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  loadingIndicator: {
    marginTop: spacing['3xl'],
  },
  footerLoader: {
    marginVertical: spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing['3xl'],
    gap: spacing.md,
  },
  emptyText: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
  },
  emptyCtaText: {
    ...typeScale.labelMd,
    fontFamily: fontFamily.semiBold,
    color: colors.primaryDark,
  },
});
