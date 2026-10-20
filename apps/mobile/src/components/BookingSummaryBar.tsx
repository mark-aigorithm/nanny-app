import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View, Pressable, Animated, Easing, ActivityIndicator } from 'react-native';
import { Text, AnimatedText } from '@mobile/components/ui/text';

import { colors, spacing } from '@mobile/theme';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import { useKeyboardVisible } from '@mobile/hooks/useKeyboardVisible';
import { styles } from './styles/booking-summary-bar.styles';

interface BookingSummaryBarProps {
  /** Live selection recap, e.g. "Thu, Jul 30 · 8:00 AM - 12:00 PM · 4h". */
  summary?: string;
  /** Shown in place of `summary` before anything is picked. */
  placeholder?: string;
  /** Formatted total, e.g. "EGP 480". Hidden while null. */
  total?: string | null;
  /** Pre-discount total, shown struck-through beside `total` when a discount applies. */
  originalTotal?: string | null;
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
 *
 * It sits in the layout under the screen's ScrollView, not over it, so the
 * scroll ends where the footer starts at any font size. While the keyboard is
 * up it shrinks to the CTA alone, without system-bar padding, and gives its
 * room to the field being typed in.
 */
export default function BookingSummaryBar({
  summary,
  placeholder = 'Nothing selected yet',
  total,
  originalTotal,
  totalLabel = 'Estimated total',
  ctaLabel,
  onPress,
  disabled = false,
  loading = false,
  children,
}: BookingSummaryBarProps) {
  const flash = useRef(new Animated.Value(0)).current;
  const bottomPadding = useBottomBarPadding();
  const keyboardVisible = useKeyboardVisible();

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
    <View style={[styles.footer, { paddingBottom: keyboardVisible ? spacing.md : bottomPadding }]}>
      {keyboardVisible ? null : children}

      {keyboardVisible ? null : (
        <View style={styles.summaryRow}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>{totalLabel}</Text>
            {/* A date, a time range and a duration: it wraps rather than cut the time off. */}
            <Text style={[styles.summaryValue, !summary && styles.summaryValueMuted]}>
              {summary || placeholder}
            </Text>
          </View>

          {total != null && (
            <View style={styles.totalWrap}>
              {originalTotal != null && (
                <Text style={styles.totalStrike} numberOfLines={1}>
                  {originalTotal}
                </Text>
              )}
              <AnimatedText
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
              </AnimatedText>
            </View>
          )}
        </View>
      )}

      <Pressable
        // Named for tests: this one control advances the date picker, the care
        // step and the review step, and its label carries a live price on two
        // of them — so there is no stable text to aim at.
        testID="booking.cta"
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
