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

import { colors } from '@mobile/theme';
import { useBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
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
  const totalDisplay = `$${booking.totalAmount.toFixed(2)}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Success Indicator ── */}
      <View style={styles.successSection}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={27} color={colors.white} />
        </View>
        <Text style={styles.heading}>You're booked.</Text>
        <Text style={styles.subtitle}>
          {nannyFirstName} is confirmed for {dateDisplay}
        </Text>
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
          <DetailRow iconName="wallet-outline" label="Charged" value={totalDisplay} />
        </View>
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={handleViewDetails}
        >
          <Ionicons name="eye-outline" size={20} color={colors.white} />
          <Text style={styles.primaryButtonText}>View booking details</Text>
        </TouchableOpacity>
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

