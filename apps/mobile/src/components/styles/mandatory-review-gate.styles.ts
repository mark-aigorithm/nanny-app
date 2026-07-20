import { StyleSheet } from 'react-native';
import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: STATUS_BAR_HEIGHT + spacing.xl,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  title: {
    ...typeScale.headingLg,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
});
