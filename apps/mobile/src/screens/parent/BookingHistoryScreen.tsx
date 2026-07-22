import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';
import OngoingBookingBanner from '@mobile/components/OngoingBookingBanner';
import { colors, STATUS_BAR_HEIGHT } from '@mobile/theme';
import type { BookingTabKey } from '@mobile/types';
import type { BookingResponse } from '@nanny-app/shared';
import { useBookingList, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatBookingStatus } from '@mobile/lib/formatBookingStatus';
import { styles } from './styles/booking-history-screen.styles';

const TABS: { key: BookingTabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_BY_TAB: Record<BookingTabKey, string> = {
  upcoming: 'PENDING,APPROVED,PENDING_CONFIRMATION,CONFIRMED,IN_PROGRESS',
  past: 'COMPLETED',
  cancelled: 'CANCELLED,REFUNDED',
};

export default function BookingHistoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BookingTabKey>('upcoming');

  const { data: bookings = [], isLoading, refetch } = useBookingList(
    STATUS_BY_TAB[activeTab],
    activeTab === 'upcoming' ? { sortBy: 'startTime', sortDir: 'asc' } : undefined,
  );
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);

  const handleViewDetails = (bookingId: string) => {
    router.push({
      pathname: '/(parent)/book/booking-detail',
      params: { bookingId, returnTo: 'bookings' },
    } as never);
  };

  const handleLeaveReview = (bookingId: string) => {
    router.push({
      pathname: '/(parent)/book/review',
      params: { bookingId, returnTo: 'bookings' },
    } as never);
  };

  const handleCompletePayment = (booking: BookingResponse) => {
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: payBookingParams(booking) as never,
    } as never);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor={colors.transparent} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            progressViewOffset={STATUS_BAR_HEIGHT}
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={styles.screenTitle}>Activity</Text>

        <OngoingBookingBanner
          onPressBooking={(booking) =>
            router.push({
              pathname: '/(parent)/book/booking-detail',
              params: { bookingId: booking.id, returnTo: 'bookings' },
            } as never)
          }
        />

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                activeOpacity={0.8}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyStateText}>No {activeTab} bookings</Text>
          </View>
        ) : activeTab === 'upcoming' ? (
          <View style={styles.section}>
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onViewDetails={handleViewDetails}
                onCompletePayment={handleCompletePayment}
              />
            ))}
          </View>
        ) : activeTab === 'past' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past bookings</Text>
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onViewDetails={handleViewDetails}
                onLeaveReview={handleLeaveReview}
              />
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onViewDetails={handleViewDetails}
                variant="cancelled"
              />
            ))}
          </View>
        )}
      </ScrollView>

      <BottomNav activeTab="activity" />
    </View>
  );
}

function BookingCard({
  booking,
  onViewDetails,
  onLeaveReview,
  onCompletePayment,
  variant = 'default',
}: {
  booking: BookingResponse;
  onViewDetails: (id: string) => void;
  onLeaveReview?: (id: string) => void;
  onCompletePayment?: (booking: BookingResponse) => void;
  variant?: 'default' | 'cancelled';
}) {
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const nannyPhoto = booking.nanny?.avatarUrl;
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
  const isCompleted = booking.status === 'COMPLETED';
  const cardStyle = variant === 'cancelled' ? styles.pastCard : styles.card;
  const statusStyle = variant === 'cancelled' || isCompleted ? styles.completedBadge : styles.statusBadge;
  const statusTextStyle = variant === 'cancelled' || isCompleted ? styles.completedBadgeText : styles.statusBadgeText;

  return (
    <View style={cardStyle}>
      <View style={styles.nannyRow}>
        {variant !== 'cancelled' ? (
          <View style={styles.nannyPhotoWrapper}>
            {nannyPhoto ? (
              <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
            )}
          </View>
        ) : null}
        <View style={styles.nannyInfo}>
          <Text style={styles.nannyName}>{nannyName}</Text>
          <Text style={styles.bookedTimesText}>
            {variant === 'cancelled' ? dateDisplay : `${dateDisplay} · ${timeDisplay}`}
          </Text>
          {isCompleted && !variant ? (
            <Text style={styles.bookedTimesText}>{formatMoney(booking.totalAmount)} total</Text>
          ) : null}
        </View>
      </View>

      <View style={statusStyle}>
        <Text style={statusTextStyle}>{formatBookingStatus(booking.status)}</Text>
      </View>

      {variant !== 'cancelled' && !isCompleted ? (
        <>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{dateDisplay}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{timeDisplay}</Text>
          </View>
        </>
      ) : null}

      {booking.cancellationReason ? (
        <Text style={[styles.bookedTimesText, { marginTop: 4 }]}>
          Reason: {booking.cancellationReason}
        </Text>
      ) : null}

      {isCompleted && booking.myReview ? (
        <View style={styles.yourReviewBlock}>
          <Text style={styles.yourReviewLabel}>Your review</Text>
          <View style={styles.reviewStarsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= booking.myReview!.rating ? 'star' : 'star-outline'}
                size={14}
                color={colors.gold}
              />
            ))}
          </View>
          {booking.myReview.comment ? (
            <Text style={styles.yourReviewComment} numberOfLines={2}>
              {booking.myReview.comment}
            </Text>
          ) : null}
        </View>
      ) : null}

      {booking.status === 'APPROVED' && onCompletePayment ? (
        <TouchableOpacity
          style={styles.payButton}
          activeOpacity={0.85}
          onPress={() => onCompletePayment(booking)}
        >
          <Ionicons name="card-outline" size={16} color={colors.white} />
          <Text style={styles.payButtonText}>Complete payment</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.cardDivider} />

      <View style={styles.cardActions}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => onViewDetails(String(booking.id))}>
          <Text style={styles.viewDetailsText}>View details</Text>
        </TouchableOpacity>
        {onLeaveReview && isCompleted && !booking.myReview ? (
          <TouchableOpacity
            style={styles.leaveReviewRow}
            activeOpacity={0.7}
            onPress={() => onLeaveReview(String(booking.id))}
          >
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={styles.leaveReviewText}>Leave review</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
