import { StyleSheet, Platform } from 'react-native';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  STATUS_BAR_HEIGHT,
  HEADER_HEIGHT,
} from '@mobile/theme';

const FOOTER_HEIGHT = 88;

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: HEADER_HEIGHT + spacing.lg,
    paddingBottom: FOOTER_HEIGHT + spacing['2xl'],
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(253,250,248,0.92)',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Child Banner Card
  childCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    ...shadows.sm,
  },
  childAvatar: {
    width: spacing['4xl'],
    height: spacing['4xl'],
    borderRadius: spacing['2xl'],
    backgroundColor: colors.surfaceMuted,
  },
  childInfo: {
    flex: 1,
    gap: 6,
  },
  childName: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  lastActivityBadge: {
    backgroundColor: colors.successLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  lastActivityText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    lineHeight: 16,
    color: colors.successDark,
  },

  // Quick Entry Grid
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  quickEntry: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  quickIconBox: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  quickLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Today's Log
  logSection: {
    gap: spacing.lg,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  logCountBadge: {
    backgroundColor: colors.taupe,
    paddingHorizontal: 10,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.full,
  },
  logCountText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  logList: {
    gap: spacing.md,
  },
  logEntry: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.sm,
  },
  logIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logEntryInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  logEntryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  logEntrySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },
  logEntryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logEntryTime: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(252,249,247,0.9)',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing['2xl'],
    zIndex: 100,
  },
  sendUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: colors.transparent,
  },
  sendUpdateText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.success,
  },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: screenPadding,
    paddingBottom: Platform.OS === 'ios' ? 40 : spacing['2xl'],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetHandle: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.taupe,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },

  // Time selector
  timeSelector: {
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: 6,
    marginBottom: spacing.lg,
  },
  timeSelectorLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  timeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeSelectorValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(227,213,202,0.3)',
  },
  toggleBtnActive: {
    backgroundColor: colors.success,
  },
  toggleText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.white,
  },

  // Notes
  notesInput: {
    backgroundColor: 'rgba(227,213,202,0.2)',
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    height: 88,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  // Save / Discard
  saveBtn: {
    backgroundColor: colors.success,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: spacing.md,
  },
  saveBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white,
  },
  discardBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
