import React, { useEffect, useRef } from 'react';
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
import { colors, HEADER_HEIGHT } from '@mobile/theme';
import BookingCareLogSection from '@mobile/components/BookingCareLogSection';
import ParentStartPinCard from '@mobile/components/ParentStartPinCard';
import ParentNannyContactCard from '@mobile/components/ParentNannyContactCard';
import { useBooking, useCancelBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { formatMoney, formatHourlyRateAmount } from '@mobile/lib/formatMoney';
import { formatBookingStatus } from '@mobile/lib/formatBookingStatus';
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
  const { bookingId, returnTo, focusCareLog } = useLocalSearchParams<{
    bookingId?: string;
    returnTo?: string;
    focusCareLog?: string;
  }>();

  const scrollRef = useRef<ScrollView>(null);
  const careLogScrollY = useRef(0);

  const { data: booking, isLoading, refetch } = useBooking(bookingId ? Number(bookingId) : undefined);
  const canViewCareLog =
    booking?.status === 'IN_PROGRESS' || booking?.status === 'COMPLETED';
  const cancelBooking = useCancelBooking();

  useEffect(() => {
    if (focusCareLog !== '1' || isLoading || !booking || !canViewCareLog) return;

    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(careLogScrollY.current - HEADER_HEIGHT, 0),
        animated: true,
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [focusCareLog, isLoading, booking, canViewCareLog]);

  const handleBack = () => {
    if (returnTo === 'bookings') {
      router.replace('/(parent)/bookings' as never);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(parent)/bookings' as never);
  };

  const handleCompletePayment = () => {
    if (!booking) return;
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: payBookingParams(booking) as never,
    } as never);
  };

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
              { id: Number(bookingId), reason: 'Cancelled by parent' },
              {
                onSuccess: () => handleBack(),
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
  const isApproved = booking.status === 'APPROVED';
  const canCancel =
    booking.status === 'CONFIRMED' || booking.status === 'PENDING' || isApproved;

  // The backend folds redeemed Care Points into discountAmount alongside the
  // promo, so split them back out to show each as its own line.
  const carePointsDiscount = booking.rewardCreditAmount;
  const promoDiscount = Math.round((booking.discountAmount - carePointsDiscount) * 100) / 100;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={[styles.statusBadge, statusStyle.badge]}>
          <Text style={[styles.statusText, statusStyle.text]}>{formatBookingStatus(booking.status)}</Text>
        </View>

        {/* Parent-only "Start booking" PIN gate (shows only within the check-in window) */}
        <ParentStartPinCard booking={booking} />

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

        {/* Nanny phone — revealed only within the configured window before start */}
        <ParentNannyContactCard booking={booking} onRefresh={() => void refetch()} />

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
            <Text style={styles.paymentValue}>
              {formatMoney(booking.baseRate * booking.durationHours)}
            </Text>
          </View>
          {booking.skillAddOns.map((addon) => (
            <View style={styles.paymentRow} key={addon.id}>
              <Text style={styles.paymentLabel}>+ {addon.name}</Text>
              <Text style={styles.paymentValue}>
                {formatMoney(addon.amountPerHour * booking.durationHours)}
              </Text>
            </View>
          ))}
          {booking.effectiveHourlyRate * booking.durationHours - booking.subtotal > 0.005 && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Longer-booking discount</Text>
              <Text style={styles.paymentValue}>
                –{formatMoney(booking.effectiveHourlyRate * booking.durationHours - booking.subtotal)}
              </Text>
            </View>
          )}
          {carePointsDiscount > 0.005 && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>
                Care Points · {booking.rewardCreditHoursApplied}h
              </Text>
              <Text style={styles.paymentValue}>–{formatMoney(carePointsDiscount)}</Text>
            </View>
          )}
          {promoDiscount > 0.005 && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Promo discount</Text>
              <Text style={styles.paymentValue}>–{formatMoney(promoDiscount)}</Text>
            </View>
          )}
          <View style={styles.paymentDivider} />
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>Total</Text>
            <Text style={styles.paymentTotalValue}>{formatMoney(booking.totalAmount)}</Text>
          </View>
          {booking.payment && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>Paid with</Text>
              <Text style={styles.paymentValue}>{booking.payment.method}</Text>
            </View>
          )}
        </View>

        {canViewCareLog && bookingId ? (
          <View
            onLayout={(event) => {
              careLogScrollY.current = event.nativeEvent.layout.y;
            }}
          >
            <BookingCareLogSection bookingId={Number(bookingId)} />
          </View>
        ) : null}

        {canCancel && (
          <View style={styles.actionsSection}>
            {isApproved && (
              <Pressable style={styles.payButton} onPress={handleCompletePayment}>
                <Ionicons name="card-outline" size={18} color={colors.white} />
                <Text style={styles.payButtonText}>Complete payment</Text>
              </Pressable>
            )}
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
