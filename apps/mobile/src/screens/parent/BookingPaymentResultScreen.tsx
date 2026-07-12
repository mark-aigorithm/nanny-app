import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookingStatus, PaymentStatus } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { useBooking, useSyncPaymobPayment } from '@mobile/hooks/useBookings';
import { bookingFlowRetryParams, type BookingFlowParams } from '@mobile/lib/bookingDraft';
import { styles } from './styles/booking-payment-result-screen.styles';

type Outcome = 'loading' | 'success' | 'failure' | 'pending' | 'stalled';

// If the initial capture never resolves within this window we stop blocking
// the user and point them at their bookings, so this screen can never trap
// them on the spinner again (ISSUE 2).
const LOADING_TIMEOUT_MS = 12_000;
// How long to keep polling a not-yet-captured payment before treating it as a
// failure the user can retry (their card was not charged).
const PENDING_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 3_000;

export default function BookingPaymentResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<BookingFlowParams & { bookingId: string }>();
  const bookingId = params.bookingId;
  const syncPaymob = useSyncPaymobPayment();
  const syncedRef = useRef(false);
  const [outcome, setOutcome] = useState<Outcome>('loading');

  const { data: booking, refetch, isError } = useBooking(bookingId);

  // Sync the Paymob capture once, then fall back to polling the booking.
  useEffect(() => {
    if (!bookingId || syncedRef.current) return;
    syncedRef.current = true;

    (async () => {
      try {
        await syncPaymob.mutateAsync(bookingId);
      } catch {
        // Ignore — we still poll the booking we already have below.
      }
      await refetch();
    })();
  }, [bookingId, refetch, syncPaymob]);

  // Resolve the outcome from the booking. A captured payment / CONFIRMED
  // booking is the terminal success (payment is the final step after admin
  // approval); a FAILED payment is the terminal failure.
  useEffect(() => {
    if (!booking) return;

    if (
      booking.status === BookingStatus.CONFIRMED ||
      booking.status === BookingStatus.IN_PROGRESS ||
      booking.status === BookingStatus.COMPLETED ||
      booking.payment?.status === PaymentStatus.CAPTURED
    ) {
      setOutcome('success');
      return;
    }

    if (booking.payment?.status === PaymentStatus.FAILED) {
      setOutcome('failure');
      return;
    }

    // Still awaiting capture (PENDING / APPROVED): move off the initial
    // spinner into the pending state without overriding a resolved outcome.
    setOutcome((current) => (current === 'loading' ? 'pending' : current));
  }, [booking]);

  // Escape hatch for the initial load: if the booking never resolves (slow or
  // failing query) flip to a graceful "still processing" state with a way out.
  useEffect(() => {
    if (outcome !== 'loading' || !bookingId) return;

    const poll = setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      setOutcome((current) => (current === 'loading' ? 'stalled' : current));
    }, LOADING_TIMEOUT_MS);

    return () => {
      clearInterval(poll);
      clearTimeout(timeout);
    };
  }, [bookingId, outcome, refetch]);

  // A hard query error must not keep the user pinned on the spinner.
  useEffect(() => {
    if (!isError) return;
    setOutcome((current) => (current === 'loading' ? 'stalled' : current));
  }, [isError]);

  // While pending, keep polling; if it never captures, surface a failure.
  useEffect(() => {
    if (outcome !== 'pending' || !bookingId) return;

    const timer = setInterval(() => {
      void refetch();
    }, POLL_INTERVAL_MS);

    const timeout = setTimeout(() => {
      setOutcome((current) => (current === 'pending' ? 'failure' : current));
    }, PENDING_TIMEOUT_MS);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [bookingId, outcome, refetch]);

  // Success → hand off to the confirmation screen.
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

  const handleViewBookings = () => {
    router.replace('/(parent)/bookings' as never);
  };

  const handleBackHome = () => {
    router.replace('/(parent)/home');
  };

  if (bookingId && (outcome === 'loading' || outcome === 'pending')) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loaderText}>
          {outcome === 'pending' ? 'Still processing your payment…' : 'Confirming your payment…'}
        </Text>
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

  // Graceful escape when we can't confirm in time (or there's no booking to
  // resolve) — never leave the user stuck, always give them a way out.
  if (outcome === 'stalled' || !bookingId) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, styles.iconCirclePending]}>
            <Ionicons name="time-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heading}>Still processing</Text>
          <Text style={styles.subtitle}>
            This is taking longer than expected. Your payment may still go through — check My
            bookings in a moment.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.85}
              onPress={handleViewBookings}
            >
              <Ionicons name="receipt-outline" size={20} color={colors.white} />
              <Text style={styles.primaryButtonText}>View my bookings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.85}
              onPress={handleBackHome}
            >
              <Text style={styles.secondaryButtonText}>Back to home</Text>
            </TouchableOpacity>
          </View>
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
