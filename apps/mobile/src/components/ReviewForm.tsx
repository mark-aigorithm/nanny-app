import React from 'react';
import { View, Pressable, Image, ActivityIndicator } from 'react-native';
import { Text, TextInput } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@mobile/theme';
import { StarRatingInput } from '@mobile/components/ui';
import { styles } from './styles/review-form.styles';

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
 * The star rating + optional comment body for `ReviewScreen` — the *optional*
 * path, reached from a past booking in history. Presentational only: the
 * consumer owns the booking/rating state, scroll container, and header.
 *
 * The mandatory prompt after a booking completes is a different component
 * (`RatingPromptSheet`) with its own layout; the two share `StarRatingInput`
 * (and so does the survey's rating question).
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

      <StarRatingInput rating={rating} onChange={onRate} />

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
