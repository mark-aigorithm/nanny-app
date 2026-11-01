import React from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer, StackHeader } from '@mobile/components/ui';
import { colors, spacing } from '@mobile/theme';
import { useBottomBarPadding } from '@mobile/hooks/useBottomInset';
import BookingCareLogSection from '@mobile/components/BookingCareLogSection';
import { BookingAddressCard } from '@mobile/components/booking/BookingAddressCard';
import { BookingChatCard } from '@mobile/components/booking/BookingChatCard';
import { CareNotesCard } from '@mobile/components/booking/CareNotesCard';
import { ChildProfilesCard } from '@mobile/components/booking/ChildProfilesCard';
import { NannyBookingStatusCard } from '@mobile/components/booking/NannyBookingStatusCard';
import { NannyShiftCard } from '@mobile/components/booking/NannyShiftCard';
import { useBooking } from '@mobile/hooks/useBookings';
import { bookingDayLabel, durationLabel } from '@mobile/lib/bookingDetail';
import { formatMoney } from '@mobile/lib/formatMoney';
import { navigateToBookingChat } from '@mobile/lib/notificationNavigation';
import { styles } from './styles/nanny-booking-detail-screen.styles';

export default function NannyBookingDetailScreen() {
  const bottomPadding = useBottomBarPadding(spacing['4xl']);
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  const { data: booking, isLoading } = useBooking(bookingId ? Number(bookingId) : undefined);
  const canViewCareLog =
    booking?.status === 'IN_PROGRESS' || booking?.status === 'COMPLETED';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(nanny)/requests' as never);
  };

  if (isLoading || !booking) {
    return (
      <ScreenContainer useSafeArea={false} style={styles.loadingCenter}>
        <ActivityIndicator color={colors.primaryDark} />
      </ScreenContainer>
    );
  }

  const isLive = booking.status === 'IN_PROGRESS';

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="Booking details"
        subtitle={bookingDayLabel(booking.date)}
        onBack={handleBack}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          {isLive ? <NannyShiftCard booking={booking} /> : <NannyBookingStatusCard booking={booking} />}

          {/* Talk to the mother during the shift; the history stays after. */}
          <BookingChatCard
            bookingId={booking.id}
            otherFirstName={booking.motherFirstName}
            onOpen={() => navigateToBookingChat(router, booking.id, 'nanny')}
          />
        </View>

        {/* She writes the log, so she gets her own section, not the mother's
            read-only timeline. */}
        {canViewCareLog ? <BookingCareLogSection bookingId={booking.id} /> : null}

        {/* Where she is going. The area only until the booking is confirmed —
            the server withholds the rest — then the whole address and a way
            to open it in Maps. */}
        <BookingAddressCard address={booking.address} />

        {/* Allergies and the parent's notes. Above earnings on purpose: this
            is the part of the booking she has to act on. */}
        <CareNotesCard
          bookingChildren={booking.children}
          specialInstructions={booking.specialInstructions}
          emphasis="warning"
        />

        {/* Diet, languages, interests and the mother's note on each child. */}
        <ChildProfilesCard bookingChildren={booking.children} />

        {/* Earnings — the nanny only sees what she takes home. */}
        <View style={styles.paymentCard}>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>You earn</Text>
            <Text style={styles.paymentTotalValue}>{formatMoney(booking.nannyAmount)}</Text>
          </View>
          <Text style={styles.paymentSubtext}>
            For {durationLabel(booking.durationHours)} of care
          </Text>
        </View>

        {/* Rating & Review */}
        {booking.status === 'COMPLETED' ? (
          <View style={styles.reviewCard}>
            <Text style={styles.reviewTitle}>Rating & review</Text>
            {booking.myReview ? (
              <>
                <View style={styles.reviewStarsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= booking.myReview!.rating ? 'star' : 'star-outline'}
                      size={18}
                      color={colors.gold}
                    />
                  ))}
                </View>
                {booking.myReview.comment ? (
                  <Text style={styles.reviewComment}>{booking.myReview.comment}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.reviewEmpty}>No review has been left for this booking yet.</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
