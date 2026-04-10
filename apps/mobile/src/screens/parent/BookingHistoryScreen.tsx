import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomNav from '@mobile/components/BottomNav';

import { colors } from '@mobile/theme';
import { Avatar } from '@mobile/components/ui';
import { IMG_PROFILE_BOOKING } from '@mobile/mocks/images';
import type { BookingTabKey, UpcomingBooking, PastBooking } from '@mobile/types';
import { MOCK_UPCOMING_BOOKINGS, MOCK_PAST_BOOKINGS } from '@mobile/mocks';
import { styles } from './styles/booking-history-screen.styles';

// ─── Tab configuration ────────────────────────────────────────────────────────

const TABS: { key: BookingTabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingHistoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BookingTabKey>('upcoming');

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

  const handleCancel = (bookingId: string) => {
    // TODO: Trigger cancellation flow via useCancelBooking mutation
    console.log('Cancel booking:', bookingId);
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

  const handleBookAgain = (_bookingId: string) => {
    router.push('/(parent)/book/booking-step-1');
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
        {activeTab === 'upcoming' && (
          <View style={styles.section}>
            {MOCK_UPCOMING_BOOKINGS.map((booking) => (
              <UpcomingBookingCard
                key={booking.id}
                booking={booking}
                onViewDetails={handleViewDetails}
                onCancel={handleCancel}
                onMessage={handleMessage}
              />
            ))}
          </View>
        )}

        {activeTab === 'past' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past bookings</Text>
            {MOCK_PAST_BOOKINGS.map((booking) => (
              <PastBookingCard
                key={booking.id}
                booking={booking}
                onLeaveReview={handleLeaveReview}
                onBookAgain={handleBookAgain}
              />
            ))}
          </View>
        )}

        {activeTab === 'cancelled' && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyStateText}>No cancelled bookings</Text>
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
  onCancel,
  onMessage,
}: {
  booking: UpcomingBooking;
  onViewDetails: (id: string) => void;
  onCancel: (id: string) => void;
  onMessage: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      {/* Nanny Info Row */}
      <View style={styles.nannyRow}>
        <View style={styles.nannyPhotoWrapper}>
          <Image
            source={{ uri: booking.nannyPhoto }}
            style={styles.nannyPhoto}
            resizeMode="cover"
          />
        </View>
        <View style={styles.nannyInfo}>
          <View style={styles.nannyNameRow}>
            <Text style={styles.nannyName}>{booking.nannyName}</Text>
            {booking.verified && (
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            )}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color={colors.gold} />
            <Text style={styles.ratingText}>
              {booking.rating.toFixed(1)} ({booking.reviewCount} reviews)
            </Text>
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
        <Text style={styles.detailText}>{booking.date}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="time-outline" size={16} color={colors.textMuted} />
        <Text style={styles.detailText}>{booking.time}</Text>
      </View>

      {/* Divider */}
      <View style={styles.cardDivider} />

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onViewDetails(booking.id)}
        >
          <Text style={styles.viewDetailsText}>View details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onCancel(booking.id)}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.messageButton}
          activeOpacity={0.7}
          onPress={() => onMessage(booking.id)}
        >
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
  onBookAgain,
}: {
  booking: PastBooking;
  onLeaveReview: (id: string) => void;
  onBookAgain: (id: string) => void;
}) {
  return (
    <View style={styles.pastCard}>
      {/* Nanny Info Row */}
      <View style={styles.nannyRow}>
        <View style={styles.nannyPhotoWrapper}>
          <Image
            source={{ uri: booking.nannyPhoto }}
            style={styles.nannyPhoto}
            resizeMode="cover"
          />
        </View>
        <View style={styles.nannyInfo}>
          <Text style={styles.nannyName}>{booking.nannyName}</Text>
          <Text style={styles.bookedTimesText}>
            Booked {booking.bookedTimes} times
          </Text>
        </View>
      </View>

      {/* Completed Badge */}
      <View style={styles.completedBadge}>
        <Text style={styles.completedBadgeText}>{booking.status}</Text>
      </View>

      {/* Actions */}
      <View style={styles.pastCardActions}>
        {!booking.hasReview && (
          <TouchableOpacity
            style={styles.leaveReviewRow}
            activeOpacity={0.7}
            onPress={() => onLeaveReview(booking.id)}
          >
            <Ionicons name="star" size={14} color={colors.gold} />
            <Text style={styles.leaveReviewText}>Leave review</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.bookAgainButton}
          activeOpacity={0.7}
          onPress={() => onBookAgain(booking.id)}
        >
          <Text style={styles.bookAgainButtonText}>Book again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

