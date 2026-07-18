import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
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
import ReviewForm from '@mobile/components/ReviewForm';
import { styles } from './styles/review-screen.styles';

export default function ReviewScreen() {
  const router = useRouter();
  const { bookingId, returnTo } = useLocalSearchParams<{ bookingId?: string; returnTo?: string }>();

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');

  const { data: booking, isLoading } = useBooking(bookingId);
  const createReview = useCreateReview(bookingId ?? '');

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
        <ReviewForm
          nannyName={nannyName}
          nannyPhoto={nannyPhoto}
          rating={rating}
          onRate={setRating}
          comment={reviewText}
          onChangeComment={setReviewText}
          onSubmit={handleSubmit}
          submitting={createReview.isPending}
          canSubmit={canSubmit}
        />
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
