import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xs,
    paddingHorizontal: screenPadding,
    gap: spacing['2xl'],
  },

  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endShiftBtn: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  endShiftBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.white,
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
  // Five fixed 64dp boxes are wider than a narrow phone's content width, so
  // the boxes shrink to their column (up to 64) and the gap stays tight.
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  quickEntry: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 7,
  },
  quickIconBox: {
    width: '100%',
    maxWidth: 64,
    aspectRatio: 1,
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
  logEntryChildren: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.primaryDark,
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  // Chips are 36dp by default; these are the sheet's main choice, so 44dp.
  childChip: {
    minHeight: 44,
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

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    // The sheet stops below the clock; past that its body scrolls.
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: screenPadding,
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
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  pickerDone: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.primary,
  },

  // Notes
  notesInput: {
    backgroundColor: colors.taupeLight,
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

  // Evidence (moved out of the screen file)
  evidenceSection: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  evidenceRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  evidenceThumbWrap: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  evidenceThumb: {
    width: '100%',
    height: '100%',
  },
  evidenceThumbRemove: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: borderRadius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceAddBtn: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.taupe,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.taupeLight,
  },
  evidenceAddBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
});
