import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookingStatus, PaymentStatus } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { useBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { formatMoney } from '@mobile/lib/formatMoney';
import { styles } from './styles/booking-confirmation-screen.styles';

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const { data: booking, isLoading } = useBooking(bookingId);

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

  const nannyFirstName = booking.nanny?.firstName ?? 'Your nanny';
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const nannyPhoto = booking.nanny?.avatarUrl ?? '';
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
  const totalDisplay = formatMoney(booking.totalAmount);

  // Payment is the final step after admin approval, so only a captured /
  // confirmed booking reads as "paid". A PENDING booking is awaiting approval;
  // an APPROVED booking is waiting on the mother's payment.
  const isPaid =
    booking.status === BookingStatus.CONFIRMED ||
    booking.status === BookingStatus.IN_PROGRESS ||
    booking.status === BookingStatus.COMPLETED ||
    booking.payment?.status === PaymentStatus.CAPTURED;
  const isApproved = booking.status === BookingStatus.APPROVED;

  let heading: string;
  let subtitle: string;
  let iconName: React.ComponentProps<typeof Ionicons>['name'];
  if (isPaid) {
    heading = "You're booked.";
    subtitle = `${nannyFirstName} is confirmed for ${dateDisplay}`;
    iconName = 'checkmark';
  } else if (isApproved) {
    heading = 'Approved — payment due';
    subtitle = `Complete payment to confirm ${nannyFirstName} for ${dateDisplay}.`;
    iconName = 'card-outline';
  } else {
    heading = 'Request sent';
    subtitle = `We'll let you know once ${nannyFirstName} is approved for ${dateDisplay}. You'll pay after approval.`;
    iconName = 'paper-plane-outline';
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
          <Ionicons name={iconName} size={27} color={isPaid ? colors.white : colors.primary} />
        </View>
        <Text style={styles.heading}>{heading}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* ── Booking Card ── */}
      <View style={styles.card}>
        {/* Nanny Header */}
        <View style={styles.nannyHeader}>
          <View style={styles.photoWrapper}>
            {nannyPhoto ? (
              <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={32} color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.nannyName}>{nannyName}</Text>
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

