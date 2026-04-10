import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { colors } from '@mobile/theme';
import { MOCK_BOOKING } from '@mobile/mocks';
import { styles } from './styles/booking-confirmation-screen.styles';

// TODO: Replace with useBookingDetails(bookingId) React Query hook

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const booking = MOCK_BOOKING;

  const handleViewDetails = () => {
    router.push({
      pathname: '/(parent)/book/booking-detail',
      params: { bookingId: bookingId ?? 'b1' },
    } as never);
  };

  const handleAddToCalendar = () => {
    // TODO: Integrate with expo-calendar to add booking event
    console.log('Add to calendar:', bookingId);
  };

  const handleBackToHome = () => {
    router.replace('/(parent)/home');
  };

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
          {booking.nannyName.split(' ')[0]} is confirmed for {booking.dateFull}
        </Text>
      </View>

      {/* ── Booking Card ── */}
      <View style={styles.card}>
        {/* Nanny Header */}
        <View style={styles.nannyHeader}>
          <View style={styles.photoWrapper}>
            <Image
              source={{ uri: booking.nannyPhoto }}
              style={styles.nannyPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.nannyName}>{booking.nannyName}</Text>
          {booking.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Details List */}
        <View style={styles.detailsList}>
          <DetailRow
            iconName="calendar-outline"
            label="Date"
            value={booking.date}
          />
          <DetailRow
            iconName="time-outline"
            label="Time"
            value={booking.time}
          />
          <DetailRow
            iconName="location-outline"
            label="Location"
            value={booking.location}
          />
          <DetailRow
            iconName="wallet-outline"
            label="Charged"
            value={booking.charged}
          />
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

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={handleAddToCalendar}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
          <Text style={styles.secondaryButtonText}>Add to calendar</Text>
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

