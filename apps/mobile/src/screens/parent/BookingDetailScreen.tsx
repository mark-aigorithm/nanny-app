import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { useBooking, useCancelBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import type { BookingStatus } from '@nanny-app/shared';
import { styles } from './styles/booking-detail-screen.styles';

function getStatusStyle(status: BookingStatus) {
  switch (status) {
    case 'CONFIRMED': return { badge: styles.statusConfirmed, text: styles.statusTextConfirmed };
    case 'COMPLETED': return { badge: styles.statusCompleted, text: styles.statusTextCompleted };
    case 'CANCELLED': return { badge: styles.statusCancelled, text: styles.statusTextCancelled };
    default:          return { badge: styles.statusPending,   text: styles.statusTextPending };
  }
}

export default function BookingDetailScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const { data: booking, isLoading } = useBooking(bookingId);
  const cancelBooking = useCancelBooking();

  const handleCancel = () => {
    if (!bookingId) return;
    Alert.alert(
      'Cancel booking',
      'Are you sure you want to cancel? Cancellations within 24 hours of the booking are subject to a 50% fee.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () => {
            cancelBooking.mutate(
              { id: bookingId, reason: 'Cancelled by parent' },
              {
                onSuccess: () => router.back(),
                onError: (err) => Alert.alert('Error', err.message),
              },
            );
          },
        },
      ],
    );
  };

  if (isLoading || !booking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const statusStyle = getStatusStyle(booking.status);
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const nannyPhoto = booking.nanny?.avatarUrl ?? '';
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
  const canCancel = booking.status === 'CONFIRMED' || booking.status === 'PENDING';

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
          {nannyPhoto ? (
            <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={24} color={colors.primary} />
            </View>
          )}
          <View style={styles.nannyInfo}>
            <View style={styles.nannyNameRow}>
              <Text style={styles.nannyName}>{nannyName}</Text>
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
            <Text style={styles.paymentLabel}>Base ${booking.baseRate} × {booking.durationHours}h</Text>
            <Text style={styles.paymentValue}>${booking.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Service fee ({booking.serviceFeePercent}%)</Text>
            <Text style={styles.paymentValue}>${booking.serviceFeeAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.paymentDivider} />
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>Total</Text>
            <Text style={styles.paymentTotalValue}>${booking.totalAmount.toFixed(2)}</Text>
          </View>
          {booking.payment && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Paid with</Text>
              <Text style={styles.paymentValue}>{booking.payment.method}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {canCancel && (
          <View style={styles.actionsSection}>
            <Pressable
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={cancelBooking.isPending}
            >
              <Text style={styles.cancelButtonText}>
                {cancelBooking.isPending ? 'Cancelling...' : 'Cancel booking'}
              </Text>
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
