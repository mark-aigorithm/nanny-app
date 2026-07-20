import React from 'react';
import { View, Text, Pressable, Image, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';
import { styles } from './styles/review-form.styles';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
const MAX_CHARS = 500;

type ReviewFormProps = {
  nannyName: string;
  nannyPhoto?: string | null;
  rating: number;
  onRate: (rating: number) => void;
  comment: string;
  onChangeComment: (comment: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  canSubmit: boolean;
};

/**
 * The star rating + optional comment body shared by the standalone
 * `ReviewScreen` and the mandatory `MandatoryReviewGate`. Presentational only —
 * the consumer owns the booking/rating state, scroll container, and header.
 */
export default function ReviewForm({
  nannyName,
  nannyPhoto,
  rating,
  onRate,
  comment,
  onChangeComment,
  onSubmit,
  submitting,
  canSubmit,
}: ReviewFormProps) {
  return (
    <View style={styles.form}>
      <View style={styles.nannySection}>
        {nannyPhoto ? (
          <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.nannyPhoto, styles.nannyPhotoFallback]}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
        )}
        <Text style={styles.nannyName}>{nannyName}</Text>
      </View>

      <View style={styles.starsSection}>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} style={styles.starButton} onPress={() => onRate(star)}>
              <Ionicons
                name={star <= rating ? 'star' : 'star-outline'}
                size={36}
                color={star <= rating ? colors.gold : colors.taupe}
              />
            </Pressable>
          ))}
        </View>
        {rating > 0 ? <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text> : null}
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewLabel}>Your review</Text>
        <TextInput
          style={styles.reviewInput}
          placeholder="Share your experience with the nanny..."
          placeholderTextColor={colors.textPlaceholder}
          value={comment}
          onChangeText={(text) => onChangeComment(text.slice(0, MAX_CHARS))}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{comment.length}/{MAX_CHARS}</Text>
      </View>

      <Pressable
        style={[styles.submitButton, !canSubmit && { opacity: 0.5 }]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitButtonText}>Submit review</Text>
        )}
      </Pressable>
    </View>
  );
}
