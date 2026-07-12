import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookingStatus, PaymentStatus } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import {
  useBooking,
  useCancelBooking,
  fmtBookingDate,
  fmtBookingTime,
} from '@mobile/hooks/useBookings';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { formatMoney } from '@mobile/lib/formatMoney';
import { styles } from './styles/booking-confirmation-screen.styles';

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  // Poll while the request is still unclaimed so the screen flips to
  // "nanny accepted — pay" on its own the moment a nanny claims it.
  const { data: booking, isLoading } = useBooking(bookingId, true);
  const cancelBooking = useCancelBooking();

  // Gentle pulse while we're still searching for a nanny.
  const pulse = useRef(new Animated.Value(0)).current;
  const isSearching = booking?.status === BookingStatus.PENDING;
  useEffect(() => {
    if (!isSearching) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isSearching, pulse]);

  const handleViewDetails = () => {
    router.push({
      pathname: '/(parent)/book/booking-detail',
      params: { bookingId: bookingId ?? '' },
    } as never);
  };

  const handleCompletePayment = () => {
    if (!booking) return;
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: payBookingParams(booking) as never,
    } as never);
  };

  const handleCancelRequest = () => {
    if (!booking) return;
    cancelBooking.mutate(
      { id: booking.id, reason: 'Cancelled by parent' },
      { onSuccess: () => router.replace('/(parent)/home') },
    );
  };

  const handleBackToHome = () => {
    router.replace('/(parent)/home');
  };

  if (isLoading || !booking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const nannyFirstName = booking.nanny?.firstName ?? 'your nanny';
  const nannyPhoto = booking.nanny?.avatarUrl ?? '';
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
  const totalDisplay = formatMoney(booking.totalAmount);

  // Payment is the final step once a nanny has claimed the request. A PENDING
  // booking is still being broadcast (no nanny yet); an APPROVED booking has
  // been claimed and is waiting on the parent's payment.
  const isPaid =
    booking.status === BookingStatus.CONFIRMED ||
    booking.status === BookingStatus.IN_PROGRESS ||
    booking.status === BookingStatus.COMPLETED ||
    booking.payment?.status === PaymentStatus.CAPTURED;
  const isApproved = booking.status === BookingStatus.APPROVED;
  const isPending = !isPaid && !isApproved;

  let heading: string;
  let subtitle: string;
  let iconName: React.ComponentProps<typeof Ionicons>['name'];
  if (isPaid) {
    heading = "You're booked.";
    subtitle = `${nannyFirstName} is confirmed for ${dateDisplay}.`;
    iconName = 'checkmark';
  } else if (isApproved) {
    heading = 'A nanny accepted!';
    subtitle = `${nannyFirstName} is ready for ${dateDisplay}. Complete payment to confirm.`;
    iconName = 'sparkles-outline';
  } else {
    heading = 'Finding a nanny';
    subtitle = "We're reaching out to nannies for you. We'll let you know the moment one accepts.";
    iconName = 'radio-outline';
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Status Indicator ── */}
      <View style={styles.successSection}>
        <View style={isPaid ? styles.successCircle : styles.pendingCircle}>
          {isPending && (
            <Animated.View
              style={[
                styles.pendingHalo,
                {
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                },
              ]}
            />
          )}
          <Ionicons name={iconName} size={27} color={isPaid ? colors.white : colors.primary} />
        </View>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* ── Booking Card ── */}
      <View style={styles.card}>
        {/* Nanny / status header */}
        <View style={styles.nannyHeader}>
          <View style={styles.photoWrapper}>
            {nannyPhoto ? (
              <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name={isPending ? 'search' : 'person'} size={30} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.nannyName}>
            {booking.nanny
              ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
              : 'Searching for a nanny…'}
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Details List */}
        <View style={styles.detailsList}>
          <DetailRow iconName="calendar-outline" label="Date" value={dateDisplay} />
          <DetailRow iconName="time-outline" label="Time" value={timeDisplay} />
          <DetailRow
            iconName="wallet-outline"
            label={isPaid ? 'Charged' : 'Total'}
            value={totalDisplay}
          />
        </View>
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.actions}>
        {isApproved ? (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={handleCompletePayment}
          >
            <Ionicons name="card-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Complete payment</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={handleViewDetails}
          >
            <Ionicons name="eye-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>View booking details</Text>
          </TouchableOpacity>
        )}

        {isPending && (
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={handleCancelRequest}
            disabled={cancelBooking.isPending}
          >
            <Ionicons name="close" size={20} color={colors.textTertiary} />
            <Text style={styles.secondaryButtonText}>
              {cancelBooking.isPending ? 'Cancelling…' : 'Cancel request'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Navigation Link ── */}
      <TouchableOpacity
        style={styles.backLink}
        activeOpacity={0.7}
        onPress={handleBackToHome}
      >
        <Text style={styles.backLinkText}>Back to home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── DetailRow ──────────────────────────────────────────────────────────────────

function DetailRow({
  iconName,
  label,
  value,
}: {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={iconName} size={16} color={colors.textMuted} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}
