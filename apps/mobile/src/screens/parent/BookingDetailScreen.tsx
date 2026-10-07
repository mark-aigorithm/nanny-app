import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@mobile/theme';
import { PressableScale, ScreenContainer, StackHeader } from '@mobile/components/ui';
import ParentStartPinCard from '@mobile/components/ParentStartPinCard';
import ParentExtensionCard from '@mobile/components/ParentExtensionCard';
import { AmountDueCard } from '@mobile/components/booking/AmountDueCard';
import { BookingInfoCard } from '@mobile/components/booking/BookingInfoCard';
import { BookingStatusCard } from '@mobile/components/booking/BookingStatusCard';
import { CareInstructionsCard } from '@mobile/components/booking/CareInstructionsCard';
import { CareTimeline } from '@mobile/components/booking/CareTimeline';
import { LiveShiftCard } from '@mobile/components/booking/LiveShiftCard';
import { useBooking, useBookingOptions, useCancelBooking } from '@mobile/hooks/useBookings';
import { bookingDayLabel } from '@mobile/lib/bookingDetail';
import { cancellationWarning } from '@mobile/lib/cancellationWarning';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { confirmDialog, noticeDialog } from '@mobile/store/confirmDialogStore';
import { styles } from './styles/booking-detail-screen.styles';

/**
 * One booking, for the mother who made it — ordered by what she needs first:
 *
 * 1. The booking itself: live shift card while it runs, a status card
 *    otherwise, with whatever she can do next (pay, start, extend, review).
 * 2. What the nanny has logged — the reason most visits here happen.
 * 3. What the nanny was told: children, allergies, notes.
 * 4. The paperwork: address, time, and the price folded to one line.
 */
export default function BookingDetailScreen() {
  const router = useRouter();
  const { bookingId, focusCareLog } = useLocalSearchParams<{
    bookingId?: string;
    focusCareLog?: string;
  }>();

  const scrollRef = useRef<ScrollView>(null);
  const careLogScrollY = useRef(0);

  const {
    data: booking,
    isLoading,
    refetch,
  } = useBooking(bookingId ? Number(bookingId) : undefined);
  const isLive = booking?.status === 'IN_PROGRESS';
  const canViewCareLog = isLive || booking?.status === 'COMPLETED';
  const cancelBooking = useCancelBooking();
  // The fee window is a console setting; read it so the warning matches the charge.
  const { data: bookingOptions } = useBookingOptions();

  // Arriving from a care-log notification: bring the timeline into view.
  useEffect(() => {
    if (focusCareLog !== '1' || isLoading || !booking || !canViewCareLog) return;

    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: careLogScrollY.current, animated: true });
    }, 350);

    return () => clearTimeout(timer);
  }, [focusCareLog, isLoading, booking, canViewCareLog]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.dismissTo('/(parent)/(tabs)/bookings');
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
    confirmDialog({
      title: 'Cancel this booking?',
      message: cancellationWarning(bookingOptions),
      confirmLabel: 'Cancel booking',
      cancelLabel: 'Keep booking',
      destructive: true,
      onConfirm: () =>
        cancelBooking.mutate(
          { id: Number(bookingId), reason: 'Cancelled by parent' },
          {
            onSuccess: () => handleBack(),
            onError: (err) => noticeDialog({ title: 'Could not cancel', message: err.message }),
          },
        ),
    });
  };

  if (isLoading || !booking) {
    return (
      <ScreenContainer useSafeArea={false}>
        <StackHeader title="Booking details" onBack={handleBack} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const nannyFirstName = booking.nanny?.firstName ?? null;

  return (
    <ScreenContainer useSafeArea={false}>
      <StackHeader
        title="Booking details"
        subtitle={bookingDayLabel(booking.date)}
        onBack={handleBack}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          {isLive ? (
            <LiveShiftCard booking={booking} onRefresh={refetch} />
          ) : (
            <BookingStatusCard
              booking={booking}
              onRefresh={refetch}
              onPay={handleCompletePayment}
              onCancel={handleCancel}
              isCancelling={cancelBooking.isPending}
            />
          )}

          {/* Money owed after an admin edit — the one thing that blocks the start. */}
          <AmountDueCard booking={booking} />
          {/* The mother's Start gate, inside the check-in window only. */}
          <ParentStartPinCard booking={booking} />
          {/* An extension waiting on the nanny, or on her payment. */}
          <ParentExtensionCard booking={booking} />
        </View>

        {canViewCareLog ? (
          <View
            onLayout={(event) => {
              careLogScrollY.current = event.nativeEvent.layout.y;
            }}
          >
            <CareTimeline
              bookingId={booking.id}
              title={isLive ? 'Today so far' : 'Care log'}
              nannyFirstName={nannyFirstName}
            />
          </View>
        ) : null}

        <CareInstructionsCard
          bookingChildren={booking.children}
          specialInstructions={booking.specialInstructions}
          nannyFirstName={nannyFirstName}
        />

        {/* Folded while there is nothing to decide; open when she is about to pay. */}
        <BookingInfoCard booking={booking} paymentOpen={booking.status === 'APPROVED'} />

        <PressableScale
          style={styles.support}
          onPress={() => router.push('/(parent)/customer-support')}
          accessibilityRole="button"
        >
          <View style={styles.supportIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primaryDark} />
          </View>
          <View style={styles.supportText}>
            <Text style={styles.supportTitle}>Something wrong?</Text>
            <Text style={styles.supportSub}>Contact support</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
        </PressableScale>
      </ScrollView>
    </ScreenContainer>
  );
}
