import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

import { colors } from '@mobile/theme';
import { Avatar } from '@mobile/components/ui';
import { IMG_PROFILE_BOOKING } from '@mobile/mocks/images';
import type { BookingTabKey } from '@mobile/types';
import type { BookingResponse } from '@nanny-app/shared';
import { useBookingList, fmtBookingDate, fmtBookingTime } from '@mobile/hooks/useBookings';
import { styles } from './styles/booking-history-screen.styles';

// ─── Tab configuration ────────────────────────────────────────────────────────

const TABS: { key: BookingTabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ─── Component ────────────────────────────────────────────────────────────────

const STATUS_BY_TAB: Record<BookingTabKey, string> = {
  upcoming: 'PENDING,CONFIRMED,IN_PROGRESS',
  past: 'COMPLETED',
  cancelled: 'CANCELLED,REFUNDED',
};

export default function BookingHistoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BookingTabKey>('upcoming');

  const { data: bookings = [], isLoading } = useBookingList(STATUS_BY_TAB[activeTab]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(parent)/home');
    }
  };

  const handleViewDetails = (bookingId: string) => {
    router.push({
      pathname: '/(parent)/book/booking-detail',
      params: { bookingId },
    } as never);
  };

  const handleMessage = (_bookingId: string) => {
    router.push('/(parent)/chat/messaging');
  };

  const handleLeaveReview = (bookingId: string) => {
    router.push({
      pathname: '/(parent)/book/review',
      params: { bookingId },
    } as never);
  };

  return (
    <View style={styles.container}>
      {/* ── Fixed Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          activeOpacity={0.7}
          onPress={handleBack}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My bookings</Text>
        <Avatar uri={IMG_PROFILE_BOOKING} size="sm" />
      </View>

      {/* ── Scrollable Content ── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Tab Bar ── */}
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

        {/* ── Tab Content ── */}
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
              <UpcomingBookingCard
                key={booking.id}
                booking={booking}
                onViewDetails={handleViewDetails}
                onMessage={handleMessage}
              />
            ))}
          </View>
        ) : activeTab === 'past' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past bookings</Text>
            {bookings.map((booking) => (
              <PastBookingCard
                key={booking.id}
                booking={booking}
                onLeaveReview={handleLeaveReview}
              />
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            {bookings.map((booking) => (
              <CancelledBookingCard key={booking.id} booking={booking} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Navigation ── */}
      <BottomNav activeTab="home" />
    </View>
  );
}

// ─── Upcoming Booking Card ────────────────────────────────────────────────────

function UpcomingBookingCard({
  booking,
  onViewDetails,
  onMessage,
}: {
  booking: BookingResponse;
  onViewDetails: (id: string) => void;
  onMessage: (id: string) => void;
}) {
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const nannyPhoto = booking.nanny?.avatarUrl;
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);

  return (
    <View style={styles.card}>
      {/* Nanny Info Row */}
      <View style={styles.nannyRow}>
        <View style={styles.nannyPhotoWrapper}>
          {nannyPhoto ? (
            <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={20} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.nannyInfo}>
          <View style={styles.nannyNameRow}>
            <Text style={styles.nannyName}>{nannyName}</Text>
          </View>
        </View>
      </View>

      {/* Status Badge */}
      <View style={styles.statusBadge}>
        <Text style={styles.statusBadgeText}>{booking.status}</Text>
      </View>

      {/* Date & Time */}
      <View style={styles.detailRow}>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={styles.detailText}>{dateDisplay}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="time-outline" size={16} color={colors.textMuted} />
        <Text style={styles.detailText}>{timeDisplay}</Text>
      </View>

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => onViewDetails(booking.id)}>
          <Text style={styles.viewDetailsText}>View details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.messageButton} activeOpacity={0.7} onPress={() => onMessage(booking.id)}>
          <Text style={styles.messageButtonText}>Message</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Past Booking Card ────────────────────────────────────────────────────────

function PastBookingCard({
  booking,
  onLeaveReview,
}: {
  booking: BookingResponse;
  onLeaveReview: (id: string) => void;
}) {
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const nannyPhoto = booking.nanny?.avatarUrl;

  return (
    <View style={styles.pastCard}>
      {/* Nanny Info Row */}
      <View style={styles.nannyRow}>
        <View style={styles.nannyPhotoWrapper}>
          {nannyPhoto ? (
            <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.nannyPhoto, { backgroundColor: colors.primaryMuted, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={20} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.nannyInfo}>
          <Text style={styles.nannyName}>{nannyName}</Text>
          <Text style={styles.bookedTimesText}>${booking.totalAmount.toFixed(2)} total</Text>
        </View>
      </View>

      {/* Completed Badge */}
      <View style={styles.completedBadge}>
        <Text style={styles.completedBadgeText}>{booking.status}</Text>
      </View>

      {/* Actions */}
      <View style={styles.pastCardActions}>
        <TouchableOpacity
          style={styles.leaveReviewRow}
          activeOpacity={0.7}
          onPress={() => onLeaveReview(booking.id)}
        >
          <Ionicons name="star" size={14} color={colors.gold} />
          <Text style={styles.leaveReviewText}>Leave review</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Cancelled Booking Card ───────────────────────────────────────────────────

function CancelledBookingCard({ booking }: { booking: BookingResponse }) {
  const nannyName = booking.nanny
    ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
    : 'Nanny TBD';
  const dateDisplay = fmtBookingDate(booking.date);

  return (
    <View style={styles.pastCard}>
      <View style={styles.nannyRow}>
        <View style={styles.nannyInfo}>
          <Text style={styles.nannyName}>{nannyName}</Text>
          <Text style={styles.bookedTimesText}>{dateDisplay}</Text>
        </View>
      </View>
      <View style={styles.completedBadge}>
        <Text style={styles.completedBadgeText}>{booking.status}</Text>
      </View>
      {booking.cancellationReason && (
        <Text style={[styles.bookedTimesText, { marginTop: 4 }]}>
          Reason: {booking.cancellationReason}
        </Text>
      )}
    </View>
  );
}

