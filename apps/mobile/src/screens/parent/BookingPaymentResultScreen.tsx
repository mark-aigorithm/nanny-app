import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import { useBooking, useSyncPaymobPayment } from '@mobile/hooks/useBookings';
import { bookingFlowRetryParams, type BookingFlowParams } from '@mobile/lib/bookingDraft';
import { styles } from './styles/booking-payment-result-screen.styles';

type Outcome = 'loading' | 'success' | 'failure' | 'pending';

export default function BookingPaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams & { bookingId: string }>();
  const bookingId = params.bookingId;
  const syncPaymob = useSyncPaymobPayment();
  const syncedRef = useRef(false);
  const [outcome, setOutcome] = useState<Outcome>('loading');

  const { data: booking, refetch } = useBooking(bookingId);

  useEffect(() => {
    if (!bookingId || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      try {
        await syncPaymob.mutateAsync(bookingId);
      } catch {
        // Fall back to polling the booking we already have.
      }
      await refetch();
    })();
  }, [bookingId, refetch, syncPaymob]);

  useEffect(() => {
    if (!booking) return;

    if (booking.status === 'CONFIRMED') {
      setOutcome('success');
      return;
    }

    if (booking.payment?.status === 'FAILED') {
      setOutcome('failure');
      return;
    }

    if (booking.status === 'PENDING') {
      setOutcome('pending');
    }
  }, [booking]);

  useEffect(() => {
    if (outcome !== 'pending' || !bookingId) return;

    const timer = setInterval(() => {
      void refetch();
    }, 3000);

    const timeout = setTimeout(() => {
      setOutcome((current) => (current === 'pending' ? 'failure' : current));
    }, 10_000);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [bookingId, outcome, refetch]);

  useEffect(() => {
    if (outcome !== 'success' || !bookingId) return;

    const timer = setTimeout(() => {
      router.replace({
        pathname: '/(parent)/book/booking-confirmation',
        params: { bookingId },
      } as never);
    }, 1200);

    return () => clearTimeout(timer);
  }, [bookingId, outcome, router]);

  const handleTryAgain = () => {
    if (!bookingId) return;
    router.replace({
      pathname: '/(parent)/book/booking-step-3',
      params: bookingFlowRetryParams(params, bookingId) as never,
    } as never);
  };

  const handleBackHome = () => {
    router.replace('/(parent)/home');
  };

  if (!bookingId || outcome === 'loading' || (outcome === 'pending' && !booking)) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loaderText}>Confirming your payment…</Text>
      </View>
    );
  }

  if (outcome === 'pending') {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loaderText}>Still processing your payment…</Text>
      </View>
    );
  }

  if (outcome === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
            <Ionicons name="checkmark" size={28} color={colors.success} />
          </View>
          <Text style={styles.heading}>Payment successful</Text>
          <Text style={styles.subtitle}>Taking you to your booking confirmation…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, styles.iconCircleFailure]}>
          <Ionicons name="close" size={28} color={colors.error} />
        </View>
        <Text style={styles.heading}>Payment failed</Text>
        <Text style={styles.subtitle}>
          Your card was not charged, or the payment was declined. You can try again with the same
          booking.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={handleTryAgain}>
            <Ionicons name="card-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.85} onPress={handleBackHome}>
            <Text style={styles.secondaryButtonText}>Back to home</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.linkButton} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.linkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
