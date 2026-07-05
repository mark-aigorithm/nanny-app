import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@mobile/theme';
import type { BookingResponse } from '@nanny-app/shared';
import { formatMoney } from '@mobile/lib/formatMoney';
import { useBookingList, useCheckIn, useCheckOut, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { useBookingShiftTimer } from '@mobile/hooks/useBookingShiftTimer';
import OngoingBookingBanner from '@mobile/components/OngoingBookingBanner';
import UpcomingShiftBanner, { confirmEndShift, confirmStartShift } from '@mobile/components/UpcomingShiftBanner';
import NannyBottomNav from '@mobile/components/NannyBottomNav';
import { styles } from './styles/nanny-requests-screen.styles';

type FilterKey = 'upcoming' | 'declined';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'declined', label: 'Declined' },
];

const STATUS_BY_FILTER: Record<FilterKey, string> = {
  upcoming: 'CONFIRMED,IN_PROGRESS',
  declined: 'CANCELLED',
};

export default function NannyRequestsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('upcoming');

  const listOptions =
    activeFilter === 'upcoming'
      ? ({ sortBy: 'startTime' as const, sortDir: 'asc' as const })
      : undefined;

  const { data: requests = [], isLoading } = useBookingList(
    STATUS_BY_FILTER[activeFilter],
    listOptions,
  );
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
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

        {/* Actions or Status */}
        {showStart || showEnd ? (
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
            activeFilter === 'upcoming' ? styles.statusAccepted : styles.statusDeclined,
          ]}>
            <Text style={[styles.statusText,
              activeFilter === 'upcoming' ? styles.statusAcceptedText : styles.statusDeclinedText,
            ]}>
              {booking.status}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
            <Text style={styles.emptyStateText}>No {activeFilter} requests</Text>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map(renderRequestCard)}
          </View>
        )}
      </ScrollView>

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Booking requests</Text>
        </View>
      </View>

      <NannyBottomNav activeTab="requests" />
    </View>
  );
}
