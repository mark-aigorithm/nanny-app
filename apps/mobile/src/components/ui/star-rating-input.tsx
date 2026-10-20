import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './text';
import { Ionicons } from '@expo/vector-icons';

import { colors, typeScale, spacing } from '@mobile/theme';
import PressableScale from './pressable-scale';

export const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'] as const;

const STAR_SIZE = 36;

interface StarRatingInputProps {
  rating: number;
  onChange: (rating: number) => void;
  showLabel?: boolean;
  /** The group's name for screen readers: the question the stars answer. */
  accessibilityLabel?: string;
  /** `center` in sheets and the review form; `start` under a left-aligned question. */
  align?: 'center' | 'start';
}

/**
 * Five stars as a radio group: each star is a radio, checked only when it is
 * the rating. Unrated outlines and the outline over a filled star both clear
 * 3:1 on the cream page (the gold fill and taupe outline alone did not), and
 * the rating word under the stars means the value never rides on colour alone.
 */
export default function StarRatingInput({
  rating,
  onChange,
  showLabel = true,
  accessibilityLabel,
  align = 'center',
}: StarRatingInputProps) {
  return (
    <View style={[styles.section, align === 'start' && styles.sectionStart]}>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= rating;
          return (
            <PressableScale
              key={star}
              haptic="select"
              accessibilityRole="radio"
              accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
              accessibilityState={{ checked: rating === star }}
              style={styles.button}
              onPress={() => onChange(star)}
            >
              {filled ? (
                <View>
                  <Ionicons name="star" size={STAR_SIZE} color={colors.gold} />
                  <Ionicons
                    name="star-outline"
                    size={STAR_SIZE}
                    color={colors.tintAmber}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ) : (
                <Ionicons name="star-outline" size={STAR_SIZE} color={colors.textMuted} />
              )}
            </PressableScale>
          );
        })}
      </View>
      {showLabel && rating > 0 ? <Text style={styles.label}>{RATING_LABELS[rating]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignItems: 'center', gap: spacing.md },
  sectionStart: { alignItems: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // 36 + 2 × 4 = 44dp, the minimum tap target.
  button: {
    padding: spacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typeScale.labelMd, color: colors.primaryDark },
});
