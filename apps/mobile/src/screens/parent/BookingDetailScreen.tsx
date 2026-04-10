import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { MOCK_BOOKING_DETAIL } from '@mobile/mocks';
import type { BookingDetail } from '@mobile/types';
import { styles } from './styles/booking-detail-screen.styles';

function getStatusStyle(status: BookingDetail['status']) {
  switch (status) {
    case 'CONFIRMED':
      return { badge: styles.statusConfirmed, text: styles.statusTextConfirmed };
    case 'COMPLETED':
      return { badge: styles.statusCompleted, text: styles.statusTextCompleted };
    case 'CANCELLED':
      return { badge: styles.statusCancelled, text: styles.statusTextCancelled };
    case 'PENDING':
      return { badge: styles.statusPending, text: styles.statusTextPending };
  }
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const { bookingId: _bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const booking = MOCK_BOOKING_DETAIL;
  const statusStyle = getStatusStyle(booking.status);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Badge */}
        <View style={[styles.statusBadge, statusStyle.badge]}>
          <Text style={[styles.statusText, statusStyle.text]}>{booking.status}</Text>
        </View>

        {/* Nanny Card */}
        <View style={styles.nannyCard}>
          <Image source={{ uri: booking.nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
          <View style={styles.nannyInfo}>
            <View style={styles.nannyNameRow}>
              <Text style={styles.nannyName}>{booking.nannyName}</Text>
              {booking.verified && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
            </View>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={colors.gold} />
              <Text style={styles.ratingText}>
                {booking.rating.toFixed(1)} ({booking.reviewCount} reviews)
              </Text>
            </View>
          </View>
        </View>

        {/* Booking Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Date</Text>
            </View>
            <Text style={styles.detailValue}>{booking.dateFull}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Time</Text>
            </View>
            <Text style={styles.detailValue}>{booking.time}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Duration</Text>
            </View>
            <Text style={styles.detailValue}>{booking.duration} hours</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="location-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Location</Text>
            </View>
            <Text style={styles.detailValue}>{booking.location}</Text>
          </View>
        </View>

        {/* Special Instructions */}
        {booking.specialInstructions !== '' && (
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsLabel}>Special instructions</Text>
            <Text style={styles.instructionsText}>{booking.specialInstructions}</Text>
          </View>
        )}

        {/* Payment Summary */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Base ${booking.hourlyRate} x {booking.duration}h</Text>
            <Text style={styles.paymentValue}>${(booking.hourlyRate * booking.duration).toFixed(2)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Platform fee</Text>
            <Text style={styles.paymentValue}>{booking.platformFee}</Text>
          </View>
          <View style={styles.paymentDivider} />
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>Total</Text>
            <Text style={styles.paymentTotalValue}>{booking.totalCharged}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Paid with</Text>
            <Text style={styles.paymentValue}>{booking.paymentMethod}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        {booking.status === 'CONFIRMED' && (
          <View style={styles.actionsSection}>
            <Pressable style={styles.messageButton}>
              <Text style={styles.messageButtonText}>Message nanny</Text>
            </Pressable>
            <Pressable style={styles.rescheduleButton}>
              <Text style={styles.rescheduleButtonText}>Reschedule</Text>
            </Pressable>
            <Pressable style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel booking</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Booking details</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </View>
  );
}
