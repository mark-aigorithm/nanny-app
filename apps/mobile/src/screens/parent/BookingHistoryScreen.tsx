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
import { Card, Avatar } from '@mobile/components/ui';
import { styles } from './styles/booking-history-screen.styles';

// ─── Placeholder images ──────────────────────────────────────────────────────
// ASSUMPTION: Images sourced from Figma CDN — expire in 7 days.
// Replace with S3/CDN URLs or bundled assets before production.

const IMG_ELENA = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';
const IMG_SARAH = 'https://www.figma.com/api/mcp/asset/b89dbd06-ef11-4609-8517-36912efbc57e';
const IMG_MARIA = 'https://www.figma.com/api/mcp/asset/1f5ca631-9125-4e5b-8903-7ba2fec58cf5';
const IMG_PROFILE = 'https://www.figma.com/api/mcp/asset/375d31c8-8abc-45b9-9273-4db36fa6b36c';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'upcoming' | 'past' | 'cancelled';

interface UpcomingBooking {
  id: string;
  nannyName: string;
  nannyPhoto: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  status: 'CONFIRMED' | 'PENDING';
  date: string;
  time: string;
}

interface PastBooking {
  id: string;
  nannyName: string;
  nannyPhoto: string;
  bookedTimes: number;
  status: 'COMPLETED';
  hasReview: boolean;
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// ASSUMPTION: Booking data will come from GET /bookings?status=upcoming|past|cancelled.
// Using hardcoded mock data until the React Query hook is wired up.

const UPCOMING_BOOKINGS: UpcomingBooking[] = [
  {
    id: 'b1',
    nannyName: 'Elena Martinez',
    nannyPhoto: IMG_ELENA,
    verified: true,
    rating: 5.0,
    reviewCount: 42,
    status: 'CONFIRMED',
    date: 'Monday, Oct 24, 2023',
    time: '09:00 AM - 04:00 PM',
  },
  {
    id: 'b2',
    nannyName: 'Sarah Jenkins',
    nannyPhoto: IMG_SARAH,
    verified: true,
    rating: 4.9,
    reviewCount: 118,
    status: 'CONFIRMED',
    date: 'Friday, Oct 28, 2023',
    time: '05:00 PM - 10:00 PM',
  },
];

const PAST_BOOKINGS: PastBooking[] = [
  {
    id: 'b3',
    nannyName: 'Maria Rodriguez',
    nannyPhoto: IMG_MARIA,
    bookedTimes: 3,
    status: 'COMPLETED',
    hasReview: false,
  },
];

// ─── Tab configuration ────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingHistoryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(parent)/home');
    }
  };

  const handleViewDetails = (bookingId: string) => {
    // TODO: Navigate to booking detail screen once it exists
    console.log('View details:', bookingId);
  };

  const handleCancel = (bookingId: string) => {
    // TODO: Trigger cancellation flow via useCancelBooking mutation
    console.log('Cancel booking:', bookingId);
  };

  const handleMessage = (_bookingId: string) => {
    router.push('/(parent)/chat/messaging' as never);
  };

  const handleLeaveReview = (bookingId: string) => {
    // TODO: Navigate to review screen once it exists
    console.log('Leave review:', bookingId);
  };

  const handleBookAgain = (_bookingId: string) => {
    router.push('/(parent)/book/booking-step-1' as never);
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
        <Avatar uri={IMG_PROFILE} size="sm" />
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
            {UPCOMING_BOOKINGS.map((booking) => (
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
            {PAST_BOOKINGS.map((booking) => (
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

