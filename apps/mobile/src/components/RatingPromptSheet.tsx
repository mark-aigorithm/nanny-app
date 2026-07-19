import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Avatar, Button, StarRatingInput } from '@mobile/components/ui';
import { useCreateReview } from '@mobile/hooks/useNannies';
import { PENDING_RATING_KEY } from '@mobile/hooks/usePendingRating';
import { getApiErrorMessage } from '@mobile/lib/api';
import {
  useRatingPromptStore,
  markRatingResolved,
} from '@mobile/store/ratingPromptStore';
import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  screenPadding,
  typeScale,
} from '@mobile/theme';

const MAX_CHARS = 500;

function isAlreadyReviewed(message: string): boolean {
  return message.toLowerCase().includes('already reviewed');
}

export default function RatingPromptSheet() {
  const booking = useRatingPromptStore((s) => s.booking);
  const clearRatingPrompt = useRatingPromptStore((s) => s.clearRatingPrompt);
  const queryClient = useQueryClient();
  const createReview = useCreateReview(booking?.id ?? '');

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset local state each time a new booking opens the sheet.
  useEffect(() => {
    setRating(0);
    setComment('');
    setError(null);
  }, [booking?.id]);

  if (!booking) return null;

  const nanny = booking.nanny;
  const nannyName = nanny ? `${nanny.firstName} ${nanny.lastName}` : 'your nanny';
  const canSubmit = rating > 0 && !createReview.isPending;

  const resolveAndClose = () => {
    markRatingResolved(booking.id);
    void queryClient.invalidateQueries({ queryKey: PENDING_RATING_KEY });
    clearRatingPrompt();
  };

  const handleSubmit = () => {
    if (rating < 1 || createReview.isPending) return;
    setError(null);
    createReview.mutate(
      { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      {
        onSuccess: () => resolveAndClose(),
        onError: (err) => {
          const message = getApiErrorMessage(err);
          if (isAlreadyReviewed(message)) {
            resolveAndClose();
            return;
          }
          setError(message);
        },
      },
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => undefined}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.handle} />

            <Avatar uri={nanny?.avatarUrl ?? undefined} size="xl" fallbackInitial={nanny?.firstName?.[0]} />
            <Text style={styles.title}>How was your booking with {nannyName}?</Text>
            <Text style={styles.subtitle}>Rate your experience to continue.</Text>

            <StarRatingInput rating={rating} onChange={setRating} />

            <TextInput
              style={styles.input}
              placeholder="Add a comment (optional)…"
              placeholderTextColor={colors.textPlaceholder}
              value={comment}
              onChangeText={(t) => setComment(t.slice(0, MAX_CHARS))}
              multiline
              textAlignVertical="top"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Submit rating"
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={createReview.isPending}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
    ...shadows.lg,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.warmBorder,
    marginBottom: spacing.xs,
  },
  title: {
    ...typeScale.headingSm,
    fontFamily: fontFamily.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...typeScale.bodyMd,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    minHeight: 96,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warmBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typeScale.bodyMd,
    color: colors.textPrimary,
  },
  error: {
    ...typeScale.bodyMd,
    color: colors.error,
    textAlign: 'center',
  },
});
