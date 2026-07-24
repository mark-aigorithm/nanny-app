import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Pressable, Animated, Easing, ActivityIndicator } from 'react-native';

import { colors } from '@mobile/theme';
import { styles } from './styles/booking-summary-bar.styles';

interface BookingSummaryBarProps {
  /** Live selection recap, e.g. "Thu, Jul 30 · 8:00 AM - 12:00 PM · 4h". */
  summary?: string;
  /** Shown in place of `summary` before anything is picked. */
  placeholder?: string;
  /** Formatted total, e.g. "EGP 480". Hidden while null. */
  total?: string | null;
  totalLabel?: string;
  ctaLabel: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Slot above the summary row — used for the duration-discount nudge. */
  children?: ReactNode;
}

/**
 * The sticky footer shared by the date picker and the review step, so the two
 * screens read as one continuous flow: what you've chosen on the left, what it
 * costs on the right, and a CTA that says what's still missing.
 *
 * The total flashes on change — a mother tapping an add-on gets a visible
 * acknowledgement that the number she cares about moved.
 */
export default function BookingSummaryBar({
  summary,
  placeholder = 'Nothing selected yet',
  total,
  totalLabel = 'Estimated total',
  ctaLabel,
  onPress,
  disabled = false,
  loading = false,
  children,
}: BookingSummaryBarProps) {
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (total == null) return;
    flash.setValue(0);
    Animated.timing(flash, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [total, flash]);

  return (
    <View style={styles.footer}>
      {children}

      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryLabel}>{totalLabel}</Text>
          <Text
            style={[styles.summaryValue, !summary && styles.summaryValueMuted]}
            numberOfLines={1}
          >
            {summary || placeholder}
          </Text>
        </View>

        {total != null && (
          <Animated.Text
            style={[
              styles.total,
              {
                opacity: flash.interpolate({
                  inputRange: [0, 0.4, 1],
                  outputRange: [0.35, 1, 1],
                }),
                transform: [
                  {
                    translateY: flash.interpolate({
                      inputRange: [0, 1],
                      outputRange: [6, 0],
                    }),
                  },
                ],
              },
            ]}
            numberOfLines={1}
          >
            {total}
          </Animated.Text>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          disabled && styles.ctaDisabled,
          pressed && !disabled && styles.ctaPressed,
        ]}
        onPress={onPress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}
