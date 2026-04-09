import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

// TODO: Replace with useBookingDetails(bookingId) React Query hook

// ASSUMPTION: Nanny photo sourced from Figma CDN — expires in 7 days.
// Replace with S3/CDN URL or bundled asset before production.
const IMG_ELENA = 'https://www.figma.com/api/mcp/asset/b036d9b4-1369-46b2-a2ab-7bf10277dba5';

// ASSUMPTION: Booking data will come from GET /bookings/:id once backend is ready.
// Using hardcoded mock data until the React Query hook is wired up.
const MOCK_BOOKING = {
  nannyName: 'Elena Martinez',
  nannyPhoto: IMG_ELENA,
  verified: true,
  date: 'Sat, Apr 12',
  dateFull: 'Saturday, Apr 12',
  time: '06:00 PM - 11:00 PM',
  location: 'Upper West Side',
  charged: '$189.95',
};

// ASSUMPTION: Font 'Manrope' is loaded at the app root via expo-font / useFonts.

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const booking = MOCK_BOOKING;

  const handleViewDetails = () => {
    // TODO: Navigate to booking detail screen once it exists
    console.log('View booking details for:', bookingId);
  };

  const handleAddToCalendar = () => {
    // TODO: Integrate with expo-calendar to add booking event
    console.log('Add to calendar:', bookingId);
  };

  const handleBackToHome = () => {
    router.replace('/(parent)/home');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Success Indicator ── */}
      <View style={styles.successSection}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={27} color="#ffffff" />
        </View>
        <Text style={styles.heading}>You're booked.</Text>
        <Text style={styles.subtitle}>
          {booking.nannyName.split(' ')[0]} is confirmed for {booking.dateFull}
        </Text>
      </View>

      {/* ── Booking Card ── */}
      <View style={styles.card}>
        {/* Nanny Header */}
        <View style={styles.nannyHeader}>
          <View style={styles.photoWrapper}>
            <Image
              source={{ uri: booking.nannyPhoto }}
              style={styles.nannyPhoto}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.nannyName}>{booking.nannyName}</Text>
          {booking.verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#97a591" />
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Details List */}
        <View style={styles.detailsList}>
          <DetailRow
            iconName="calendar-outline"
            label="Date"
            value={booking.date}
          />
          <DetailRow
            iconName="time-outline"
            label="Time"
            value={booking.time}
          />
          <DetailRow
            iconName="location-outline"
            label="Location"
            value={booking.location}
          />
          <DetailRow
            iconName="wallet-outline"
            label="Charged"
            value={booking.charged}
          />
        </View>
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.85}
          onPress={handleViewDetails}
        >
          <Ionicons name="eye-outline" size={20} color="#ffffff" />
          <Text style={styles.primaryButtonText}>View booking details</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          activeOpacity={0.85}
          onPress={handleAddToCalendar}
        >
          <Ionicons name="calendar-outline" size={20} color="#6b6158" />
          <Text style={styles.secondaryButtonText}>Add to calendar</Text>
        </TouchableOpacity>
      </View>

      {/* ── Navigation Link ── */}
      <TouchableOpacity
        style={styles.backLink}
        activeOpacity={0.7}
        onPress={handleBackToHome}
      >
        <Text style={styles.backLinkText}>Back to home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── DetailRow ──────────────────────────────────────────────────────────────────

function DetailRow({
  iconName,
  label,
  value,
}: {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLeft}>
        <Ionicons name={iconName} size={16} color="#7a7a7a" />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fdfaf8',
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 63,
  },

  // Success Indicator
  successSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#d4e8d4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heading: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 28,
    letterSpacing: -0.7,
    color: '#1b1c1b',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 16,
    color: '#7a7a7a',
    textAlign: 'center',
  },

  // Booking Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#7a7a7a',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 32,
    shadowOpacity: 0.08,
    elevation: 4,
  },

  // Nanny Header
  nannyHeader: {
    alignItems: 'center',
  },
  photoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#f6f3f1',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  nannyPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  nannyName: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 18,
    color: '#1b1c1b',
    textAlign: 'center',
    marginBottom: 8,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(151,165,145,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  verifiedText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 12,
    color: '#97a591',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(229,226,224,0.5)',
    marginVertical: 24,
  },

  // Details List
  detailsList: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontFamily: 'Manrope',
    fontWeight: '400',
    fontSize: 13,
    color: '#7a7a7a',
  },
  detailValue: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 14,
    color: '#1b1c1b',
  },

  // Action Buttons
  actions: {
    width: '100%',
    paddingTop: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#97a591',
    borderRadius: 24,
    height: 56,
  },
  primaryButtonText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#ffffff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ebddd2',
    borderRadius: 24,
    height: 56,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 16,
    color: '#6b6158',
  },

  // Back Link
  backLink: {
    paddingTop: 40,
    alignItems: 'center',
  },
  backLinkText: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 14,
    color: '#7a7a7a',
  },
});
