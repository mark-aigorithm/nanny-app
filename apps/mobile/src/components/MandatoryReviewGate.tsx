import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, StatusBar, Alert } from 'react-native';

import { useUnratedCompletedBooking } from '@mobile/hooks/useMandatoryReview';
import { useCreateReview } from '@mobile/hooks/useNannies';
import { getApiErrorMessage } from '@mobile/lib/api';
import ReviewForm from '@mobile/components/ReviewForm';
import { styles } from './styles/mandatory-review-gate.styles';

/**
 * Blocks the parent app until the mother rates every completed booking. A
 * booking becomes COMPLETED when the nanny checks out; the gate surfaces the
 * first one she hasn't reviewed and won't dismiss until she submits. Mounted
 * once in the parent layout, above the tabs — mirrors `RegisterPromptModal`.
 *
 * Non-dismissable by design: no backdrop, no close/skip control, and a no-op
 * `onRequestClose` swallows Android hardware-back. Submitting invalidates the
 * bookings query, so the gate advances to the next owed review or closes on
 * its own once none remain.
 */
export default function MandatoryReviewGate() {
  const { booking } = useUnratedCompletedBooking();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const createReview = useCreateReview(booking?.id ?? '');

  // Reset the form whenever the owed booking changes (advancing to the next
  // unrated one) so a fresh rating starts empty.
  useEffect(() => {
    setRating(0);
    setComment('');
  }, [booking?.id]);

  if (!booking) return null;

  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Your nanny';
  const nannyPhoto = booking.nanny?.avatarUrl;
  const canSubmit = rating > 0 && !createReview.isPending;

  const handleSubmit = () => {
    if (rating < 1) return;

    createReview.mutate(
      {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      },
      {
        // Clear immediately so the button disables during the bookings refetch
        // (prevents a double-submit before the gate advances/closes).
        onSuccess: () => {
          setRating(0);
          setComment('');
        },
        onError: (err) => Alert.alert('Could not submit review', getApiErrorMessage(err)),
      },
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => {}}>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.header}>
          <Text style={styles.title}>Rate your booking</Text>
          <Text style={styles.subtitle}>
            Please rate your last booking to continue using the app.
          </Text>
        </View>

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
            comment={comment}
            onChangeComment={setComment}
            onSubmit={handleSubmit}
            submitting={createReview.isPending}
            canSubmit={canSubmit}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
