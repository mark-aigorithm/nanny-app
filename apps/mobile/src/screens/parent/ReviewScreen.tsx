import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { useBooking } from '@mobile/hooks/useBookings';
import { useCreateReview } from '@mobile/hooks/useNannies';
import { getApiErrorMessage } from '@mobile/lib/api';
import { styles } from './styles/review-screen.styles';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
const MAX_CHARS = 500;

export default function ReviewScreen() {
  const router = useRouter();
  const { bookingId, returnTo } = useLocalSearchParams<{ bookingId?: string; returnTo?: string }>();

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const numericBookingId = bookingId ? Number(bookingId) : undefined;
  const { data: booking, isLoading } = useBooking(numericBookingId);
  const createReview = useCreateReview(numericBookingId ?? 0);

  const nannyName = booking?.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Your nanny';
  const nannyPhoto = booking?.nanny?.avatarUrl;
  const canSubmit = rating > 0 && !!bookingId && !createReview.isPending;

  const handleExit = () => {
    if (returnTo === 'bookings') {
      router.replace('/(parent)/bookings' as never);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(parent)/bookings' as never);
  };

  const handleSubmit = () => {
    if (!bookingId || rating < 1) return;

    createReview.mutate(
      {
        rating,
        ...(reviewText.trim() ? { comment: reviewText.trim() } : {}),
      },
      {
        onSuccess: () => handleExit(),
        onError: (err) => Alert.alert('Could not submit review', getApiErrorMessage(err)),
      },
    );
  };

  if (!bookingId) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.ratingLabel}>Missing booking.</Text>
        <Pressable onPress={handleExit}>
          <Text style={[styles.ratingLabel, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (isLoading || !booking) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.nannySection}>
          {nannyPhoto ? (
            <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={40} color={colors.primary} />
            </View>
          )}
          <Text style={styles.nannyName}>{nannyName}</Text>
        </View>

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
          {rating > 0 ? <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text> : null}
        </View>

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

        <Pressable
          style={[styles.submitButton, !canSubmit && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {createReview.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Submit review</Text>
          )}
        </Pressable>
      </ScrollView>

      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={handleExit} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Leave a review</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </View>
  );
}
