import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@mobile/theme';
import type { BookingResponse } from '@nanny-app/shared';
import { useBookingList, useAcceptBooking, useCancelBooking, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { styles } from './styles/nanny-requests-screen.styles';

type FilterKey = 'pending' | 'accepted' | 'declined';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
];

const STATUS_BY_FILTER: Record<FilterKey, string> = {
  pending: 'PENDING',
  accepted: 'CONFIRMED,IN_PROGRESS',
  declined: 'CANCELLED',
};

export default function NannyRequestsScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');

  const { data: requests = [], isLoading } = useBookingList(STATUS_BY_FILTER[activeFilter]);
  const acceptBooking = useAcceptBooking();
  const cancelBooking = useCancelBooking();

  const handleAccept = (id: string) => {
    acceptBooking.mutate(id, {
      onError: (err) => Alert.alert('Error', err.message),
    });
  };

  const handleDecline = (id: string) => {
    Alert.alert(
      'Decline request',
      'Are you sure you want to decline this booking?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () =>
            cancelBooking.mutate(
              { id, reason: 'Declined by nanny' },
              { onError: (err) => Alert.alert('Error', err.message) },
            ),
        },
      ],
    );
  };

  const renderRequestCard = (booking: BookingResponse) => {
    const dateDisplay = fmtBookingDate(booking.date);
    const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
    const motherName = `${booking.motherFirstName} ${booking.motherLastName}`;
    const isPending = booking.status === 'PENDING';

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
            <Text style={styles.amountText}>${booking.totalAmount.toFixed(2)}</Text>
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
        {isPending ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.declineButton}
              onPress={() => handleDecline(booking.id)}
              disabled={cancelBooking.isPending}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>
            <Pressable
              style={styles.acceptButton}
              onPress={() => handleAccept(booking.id)}
              disabled={acceptBooking.isPending}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.statusBadge,
            activeFilter === 'accepted' ? styles.statusAccepted : styles.statusDeclined,
          ]}>
            <Text style={[styles.statusText,
              activeFilter === 'accepted' ? styles.statusAcceptedText : styles.statusDeclinedText,
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
    </View>
  );
}
