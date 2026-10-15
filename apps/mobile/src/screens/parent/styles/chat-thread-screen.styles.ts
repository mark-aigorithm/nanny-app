import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

const HEADER_HEIGHT = STATUS_BAR_HEIGHT + 64;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.sm,
    paddingBottom: 100,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.taupe,
    zIndex: 100,
    ...shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  headerNameCol: {
    gap: 1,
    flex: 1,
  },
  headerName: {
    ...typeScale.headingSm,
    color: colors.textDark,
  },
  listingWrap: {
    paddingVertical: spacing.xs,
  },
  listingCard: {
    backgroundColor: colors.taupe,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  listingImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  listingTextCol: {
    flex: 1,
    gap: spacing.xxs,
  },
  listingTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.textDark,
  },
  listingPrice: {
    ...typeScale.captionBold,
    color: colors.primary,
  },
});
