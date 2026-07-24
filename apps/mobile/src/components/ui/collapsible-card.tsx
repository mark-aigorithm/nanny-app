import React, { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import type { ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typeScale, borderRadius, spacing, shadows } from '@mobile/theme';

interface CollapsibleCardProps {
  title: string;
  /** Right-hand summary shown on the header row, e.g. the amount saved. */
  summary?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A white card whose body expands and collapses. Keeps a dense screen scannable:
 * the header always carries the headline number, the detail is one tap away.
 */
export default function CollapsibleCard({
  title,
  summary,
  icon,
  iconColor = colors.primaryDark,
  defaultOpen = false,
  children,
  style,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const chevron = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const bodyFade = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  /**
   * Deliberately no LayoutAnimation here. It is unsupported on the New
   * Architecture (the default from Expo SDK 54 / RN 0.81), where calling it
   * can throw — and because it ran before setOpen, one throw meant the card
   * never toggled at all. react-native-web shims it to a no-op, so the web
   * preview passed while devices did nothing. Opacity on the native driver
   * works everywhere.
   */
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.parallel([
      Animated.timing(chevron, {
        toValue: next ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(bodyFade, {
        toValue: next ? 1 : 0,
        duration: next ? 180 : 0,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const rotate = chevron.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[styles.card, style]}>
      <Pressable style={styles.header} onPress={toggle}>
        {icon && <Ionicons name={icon} size={18} color={iconColor} />}
        <Text style={styles.title}>{title}</Text>
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </Animated.View>
      </Pressable>

      {open && (
        <Animated.View style={[styles.body, { opacity: bodyFade }]}>{children}</Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 32,
  },
  title: {
    ...typeScale.labelMd,
    color: colors.textPrimary,
    flex: 1,
  },
  summary: {
    ...typeScale.labelSm,
    color: colors.successDark,
  },
  body: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.md,
  },
});
