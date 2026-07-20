import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typeScale, spacing } from '@mobile/theme';

export const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'] as const;

interface StarRatingInputProps {
  rating: number;
  onChange: (rating: number) => void;
  showLabel?: boolean;
}

export default function StarRatingInput({ rating, onChange, showLabel = true }: StarRatingInputProps) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            key={star}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
            style={styles.button}
            onPress={() => onChange(star)}
          >
            <Ionicons
              name={star <= rating ? 'star' : 'star-outline'}
              size={36}
              color={star <= rating ? colors.gold : colors.taupe}
            />
          </Pressable>
        ))}
      </View>
      {showLabel && rating > 0 ? <Text style={styles.label}>{RATING_LABELS[rating]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignItems: 'center', gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  button: { padding: spacing.xs },
  label: { ...typeScale.labelMd, color: colors.primary },
});
