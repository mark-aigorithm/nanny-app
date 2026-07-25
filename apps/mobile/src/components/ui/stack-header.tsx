import React from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  colors,
  typeScale,
  spacing,
  screenPadding,
  STATUS_BAR_HEIGHT,
} from '@mobile/theme';

interface StackHeaderProps {
  title: string;
  subtitle?: string;
  /** Show the back chevron above the title. Defaults to true. */
  showBackButton?: boolean;
  /** Custom back handler; falls back to router.back(). */
  onBack?: () => void;
  /** Optional control aligned to the title's baseline on the right. */
  rightElement?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The standard chrome for secondary/detail screens and section tabs: a large,
 * left-aligned title with an optional back chevron above it (iOS large-title
 * pattern). Owns the top inset so screens never pad STATUS_BAR_HEIGHT by hand.
 */
export default function StackHeader({
  title,
  subtitle,
  showBackButton = true,
  onBack,
  rightElement,
  style,
}: StackHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.container, style]}>
      {showBackButton && (
        <Pressable onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
      )}

      <View style={styles.titleRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightElement ? <View style={styles.rightElement}>{rightElement}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    paddingTop: STATUS_BAR_HEIGHT + spacing.sm,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    // Pull the chevron to the screen's left edge so it sits above the title.
    marginLeft: -spacing.sm,
    marginBottom: spacing.xxs,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titleWrap: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typeScale.displaySm,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textMuted,
  },
  rightElement: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
});
