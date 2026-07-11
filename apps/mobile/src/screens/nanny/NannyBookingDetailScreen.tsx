import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import BookingCareLogSection from '@mobile/components/BookingCareLogSection';
import { useBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { formatMoney, formatHourlyRateAmount } from '@mobile/lib/formatMoney';
import { formatBookingStatus } from '@mobile/lib/formatBookingStatus';
import type { BookingStatus } from '@nanny-app/shared';
import { styles } from './styles/nanny-booking-detail-screen.styles';

function getStatusStyle(status: BookingStatus) {
  switch (status) {
    case 'CONFIRMED': return { badge: styles.statusConfirmed, text: styles.statusTextConfirmed };
    case 'COMPLETED': return { badge: styles.statusCompleted, text: styles.statusTextCompleted };
    case 'CANCELLED': return { badge: styles.statusCancelled, text: styles.statusTextCancelled };
    default:          return { badge: styles.statusPending,   text: styles.statusTextPending };
  }
}

export default function NannyBookingDetailScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const { data: booking, isLoading } = useBooking(bookingId);
  const canViewCareLog =
    booking?.status === 'IN_PROGRESS' || booking?.status === 'COMPLETED';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(nanny)/requests' as never);
  };

  if (isLoading || !booking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusStyle = getStatusStyle(booking.status);
  const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
  const motherPhoto = booking.motherAvatarUrl ?? '';
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={[styles.statusBadge, statusStyle.badge]}>
          <Text style={[styles.statusText, statusStyle.text]}>{formatBookingStatus(booking.status)}</Text>
        </View>

        {/* Mother Card */}
        <View style={styles.motherCard}>
          {motherPhoto ? (
            <Image source={{ uri: motherPhoto }} style={styles.motherPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.motherPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.motherInfo}>
            <Text style={styles.motherName}>{motherName}</Text>
          </View>
        </View>

        {/* Booking Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Date</Text>
            </View>
            <Text style={styles.detailValue}>{dateDisplay}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="time-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Time</Text>
            </View>
            <Text style={styles.detailValue}>{timeDisplay}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textMuted} />
              <Text style={styles.detailLabel}>Duration</Text>
            </View>
            <Text style={styles.detailValue}>{booking.durationHours} hours</Text>
          </View>
        </View>

        {/* Payment Summary */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>
              Base {formatHourlyRateAmount(booking.baseRate)} × {booking.durationHours}h
            </Text>
            <Text style={styles.paymentValue}>{formatMoney(booking.subtotal)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Service fee ({booking.serviceFeePercent}%)</Text>
            <Text style={styles.paymentValue}>{formatMoney(booking.serviceFeeAmount)}</Text>
          </View>
          <View style={styles.paymentDivider} />
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>Total</Text>
            <Text style={styles.paymentTotalValue}>{formatMoney(booking.totalAmount)}</Text>
          </View>
        </View>

        {/* Care Log */}
        {canViewCareLog && bookingId ? <BookingCareLogSection bookingId={bookingId} /> : null}

        {/* Rating & Review */}
        {booking.status === 'COMPLETED' ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Rating & review</Text>
            {booking.myReview ? (
              <>
                <View style={styles.reviewStarsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= booking.myReview!.rating ? 'star' : 'star-outline'}
                      size={18}
                      color={colors.gold}
                    />
                  ))}
                </View>
                {booking.myReview.comment ? (
                  <Text style={styles.reviewComment}>{booking.myReview.comment}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.reviewEmpty}>No review has been left for this booking yet.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={handleBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Booking details</Text>
          <View style={styles.iconBtn} />
        </View>
      </View>
    </View>
  );
}
