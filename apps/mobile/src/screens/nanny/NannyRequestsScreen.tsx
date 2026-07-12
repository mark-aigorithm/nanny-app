import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, HEADER_HEIGHT } from '@mobile/theme';
import type { BookingResponse } from '@nanny-app/shared';
import { formatMoney } from '@mobile/lib/formatMoney';
import { formatBookingStatus } from '@mobile/lib/formatBookingStatus';
import {
  useBookingList,
  useCheckIn,
  useCheckOut,
  useAcceptBooking,
  useDeclineBooking,
  fmtBookingDate,
  fmtBookingTime,
} from '@mobile/hooks/useBookings';
import { useRefreshByUser } from '@mobile/hooks/useRefreshByUser';
import { useBookingShiftTimer } from '@mobile/hooks/useBookingShiftTimer';
import OngoingBookingBanner from '@mobile/components/OngoingBookingBanner';
import UpcomingShiftBanner, { confirmEndShift, confirmStartShift } from '@mobile/components/UpcomingShiftBanner';
import NannyBottomNav from '@mobile/components/NannyBottomNav';
import NannyTabHeader from '@mobile/components/NannyTabHeader';
import { styles } from './styles/nanny-requests-screen.styles';

type FilterKey = 'requests' | 'upcoming' | 'past' | 'declined';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'requests', label: 'Requests' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'declined', label: 'Declined' },
];

const STATUS_BY_FILTER: Record<FilterKey, string> = {
  // Pending requests awaiting admin approval — the nanny may optionally
  // accept/decline (advisory only; admin approval confirms the booking).
  requests: 'PENDING',
  upcoming: 'CONFIRMED,IN_PROGRESS',
  past: 'COMPLETED',
  declined: 'CANCELLED',
};

const EMPTY_LABEL: Record<FilterKey, string> = {
  requests: 'No new requests',
  upcoming: 'No upcoming bookings',
  past: 'No past bookings',
  declined: 'No declined bookings',
};

export default function NannyRequestsScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('requests');

  const listOptions =
    activeFilter === 'upcoming' || activeFilter === 'requests'
      ? ({ sortBy: 'startTime' as const, sortDir: 'asc' as const })
      : undefined;

  const { data: requests = [], isLoading, refetch } = useBookingList(
    STATUS_BY_FILTER[activeFilter],
    listOptions,
  );
  const { isRefreshingByUser, refreshByUser } = useRefreshByUser(refetch);
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const acceptBooking = useAcceptBooking();
  const declineBooking = useDeclineBooking();
  const { nearestBooking, canCheckIn, canCheckOut } = useBookingShiftTimer(
    activeFilter === 'upcoming' ? requests : [],
  );

  const renderRequestCard = (booking: BookingResponse) => {
    const dateDisplay = fmtBookingDate(booking.date);
    const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
    const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
    const isInProgress = booking.status === 'IN_PROGRESS';
    const showStart =
      activeFilter === 'upcoming' &&
      booking.status === 'CONFIRMED' &&
      nearestBooking?.id === booking.id &&
      canCheckIn;
    const showEnd =
      activeFilter === 'upcoming' &&
      isInProgress &&
      nearestBooking?.id === booking.id &&
      canCheckOut;
    const isDeciding =
      (acceptBooking.isPending && acceptBooking.variables === booking.id) ||
      (declineBooking.isPending && declineBooking.variables === booking.id);

    return (
      <View key={booking.id} style={styles.requestCard}>
        {/* Parent info */}
        <View style={styles.parentRow}>
          <View style={[styles.parentAvatar, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={18} color={colors.primary} />
          </View>
          <View style={styles.parentInfo}>
            <Text style={styles.parentName}>{motherName}</Text>
            <Text style={styles.requestedAt}>{new Date(booking.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={styles.amountBadge}>
            <Text style={styles.amountText}>{formatMoney(booking.totalAmount)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{dateDisplay}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{timeDisplay} ({booking.durationHours}h)</Text>
          </View>
        </View>

        {/* Mother's review (past bookings) */}
        {activeFilter === 'past' && booking.myReview ? (
          <View style={styles.reviewBlock}>
            <Text style={styles.reviewLabel}>Rating & review</Text>
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
              <Text style={styles.reviewComment} numberOfLines={2}>
                {booking.myReview.comment}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Requests tab: optional accept/decline + admin-approval note */}
        {activeFilter === 'requests' ? (
          <View style={styles.decisionSection}>
            {booking.nannyDecision === 'ACCEPTED' ? (
              <View style={[styles.statusBadge, styles.statusAccepted]}>
                <Text style={[styles.statusText, styles.statusAcceptedText]}>You accepted</Text>
              </View>
            ) : booking.nannyDecision === 'DECLINED' ? (
              <View style={[styles.statusBadge, styles.statusDeclined]}>
                <Text style={[styles.statusText, styles.statusDeclinedText]}>You declined</Text>
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <Pressable
                  style={styles.acceptButton}
                  onPress={() => acceptBooking.mutate(booking.id)}
                  disabled={isDeciding}
                >
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={styles.declineButton}
                  onPress={() => declineBooking.mutate(booking.id)}
                  disabled={isDeciding}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.decisionNote}>
              Optional — an admin approves bookings. Accepting just tells them you're available.
            </Text>
          </View>
        ) : showStart || showEnd ? (
          <View style={styles.actionsRow}>
            {showStart ? (
              <Pressable
                style={styles.acceptButton}
                onPress={() => confirmStartShift(booking, checkIn)}
                disabled={checkIn.isPending}
              >
                <Text style={styles.acceptButtonText}>Start shift</Text>
              </Pressable>
            ) : null}
            {showEnd ? (
              <Pressable
                style={styles.declineButton}
                onPress={() => confirmEndShift(booking, checkOut)}
                disabled={checkOut.isPending}
              >
                <Text style={styles.declineButtonText}>End shift</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={[styles.statusBadge,
            activeFilter === 'declined' ? styles.statusDeclined : styles.statusAccepted,
          ]}>
            <Text style={[styles.statusText,
              activeFilter === 'declined' ? styles.statusDeclinedText : styles.statusAcceptedText,
            ]}>
              {formatBookingStatus(booking.status)}
            </Text>
          </View>
        )}

        {activeFilter === 'past' ? (
          <Pressable
            style={styles.viewDetailsRow}
            onPress={() =>
              router.push({
                pathname: '/(nanny)/booking-detail',
                params: { bookingId: booking.id },
              } as never)
            }
          >
            <Text style={styles.viewDetailsText}>View details</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            progressViewOffset={HEADER_HEIGHT}
            refreshing={isRefreshingByUser}
            onRefresh={refreshByUser}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <OngoingBookingBanner />
        {activeFilter === 'upcoming' ? <UpcomingShiftBanner bookings={requests} /> : null}

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(filter.key)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Request cards */}
        {isLoading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.taupe} />
            <Text style={styles.emptyStateText}>{EMPTY_LABEL[activeFilter]}</Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map(renderRequestCard)}
          </View>
        )}
      </ScrollView>

      <NannyTabHeader title="Booking requests" />

      <NannyBottomNav activeTab="requests" />
    </View>
  );
}
