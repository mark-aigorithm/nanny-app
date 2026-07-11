import { StyleSheet } from 'react-native';

import {
  colors,
  fontFamily,
  typeScale,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  // Wrapper is relatively positioned so the dropdown can absolutely overlay
  // whatever sits below (the map). High zIndex keeps it above sibling views.
  container: {
    position: 'relative',
    zIndex: 20,
  },

  // Icon input (mirrors the address input styling on the registration screens)
  inputWrapper: {
    height: 56,
    backgroundColor: colors.taupeLight,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  inputInner: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  clearButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Suggestions dropdown
  dropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.taupe,
    overflow: 'hidden',
    zIndex: 30,
    ...shadows.lg,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
  },
  suggestionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  suggestionText: {
    ...typeScale.bodyMd,
    color: colors.textPrimary,
    flex: 1,
  },
});
