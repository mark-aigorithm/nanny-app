import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { MOCK_NANNY_BOOKING } from '@mobile/mocks';
import { styles } from './styles/review-screen.styles';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
const MAX_CHARS = 500;

export default function ReviewScreen() {
  const router = useRouter();
  const { bookingId: _bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const nanny = MOCK_NANNY_BOOKING;
  const canSubmit = rating > 0;

  const handleSubmit = () => {
    // TODO: Wire up useCreateReview mutation
    router.back();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nanny Info */}
        <View style={styles.nannySection}>
          <Image source={{ uri: nanny.image }} style={styles.nannyPhoto} resizeMode="cover" />
          <Text style={styles.nannyName}>{nanny.name}</Text>
        </View>

        {/* Star Rating */}
        <View style={styles.starsSection}>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable key={star} style={styles.starButton} onPress={() => setRating(star)}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color={star <= rating ? colors.gold : colors.taupe}
                />
              </Pressable>
            ))}
          </View>
          {rating > 0 && <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>}
        </View>

        {/* Review Text */}
        <View style={styles.reviewSection}>
          <Text style={styles.reviewLabel}>Your review</Text>
          <TextInput
            style={styles.reviewInput}
            placeholder="Share your experience with the nanny..."
            placeholderTextColor={colors.textPlaceholder}
            value={reviewText}
            onChangeText={(text) => setReviewText(text.slice(0, MAX_CHARS))}
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{reviewText.length}/{MAX_CHARS}</Text>
        </View>

        {/* Photo Upload */}
        <View style={styles.photoSection}>
          <Text style={styles.photoLabel}>Add photos (optional)</Text>
          <View style={styles.photoRow}>
            <Pressable style={styles.addPhotoButton}>
              <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.submitButton, !canSubmit && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text style={styles.submitButtonText}>Submit review</Text>
        </Pressable>
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Leave a review</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </View>
  );
}
