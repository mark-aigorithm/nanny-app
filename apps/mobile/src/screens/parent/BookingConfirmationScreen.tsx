import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BookingStatus, PaymentStatus, type BookingResponse } from '@nanny-app/shared';

import { colors } from '@mobile/theme';
import { PulseRings, Stepper } from '@mobile/components/ui';
import {
  useBooking,
  useCancelBooking,
  useRedeemBookingPoints,
  useRefundBookingPoints,
  fmtBookingDate,
  fmtBookingTime,
} from '@mobile/hooks/useBookings';
import { useRewardConfig, useRewardWallet } from '@mobile/hooks/useRewards';
import { payBookingParams } from '@mobile/lib/bookingDraft';
import { formatMoney } from '@mobile/lib/formatMoney';
import { styles } from './styles/booking-confirmation-screen.styles';

/**
 * Cycled while the request is out for broadcast. Deliberately generic — the app
 * gets no per-nanny signal back, so nothing here may imply a live count.
 */
const SEARCH_MESSAGES = [
  'Notifying available nannies near you…',
  'Nannies are reviewing your request…',
  'This usually takes just a few minutes.',
] as const;

const NEXT_STEPS = [
  { title: 'Request sent', detail: 'Every available nanny can see it' },
  { title: 'A nanny accepts', detail: 'First to accept takes the booking' },
  { title: 'Pay & confirm', detail: 'Your card is charged only then' },
] as const;

/** "4m 12s" since the request was created. */
function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function BookingConfirmationScreen() {
  const router = useRouter();
  const { bookingId, pointsHours } = useLocalSearchParams<{
    bookingId: string;
    pointsHours?: string;
  }>();

  // Poll while the request is still unclaimed so the screen flips to
  // "nanny accepted — pay" on its own the moment a nanny claims it.
  const { data: booking, isLoading } = useBooking(Number(bookingId), true);
  const cancelBooking = useCancelBooking();
  const redeem = useRedeemBookingPoints();

  const isSearching = booking?.status === BookingStatus.PENDING;

  // ── Rotating reassurance copy ──
  const [messageIndex, setMessageIndex] = useState(0);
  const messageFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isSearching) return;
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(messageFade, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(messageFade, {
          toValue: 1,
          duration: 240,
          delay: 60,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
      // Swapped mid-fade so the text never changes while fully visible.
      setTimeout(() => setMessageIndex((i) => (i + 1) % SEARCH_MESSAGES.length), 260);
    }, 4000);
    return () => clearInterval(timer);
  }, [isSearching, messageFade]);

  // ── Elapsed since the request was created ──
  // Read off `createdAt` rather than mount time, so leaving and coming back
  // doesn't restart the clock.
  const [elapsed, setElapsed] = useState(0);
  const createdAt = booking?.createdAt;
  useEffect(() => {
    if (!isSearching || !createdAt) return;
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isSearching, createdAt]);

  // ── Reveal when a nanny claims the request ──
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSearching || !booking) return;
    Animated.spring(reveal, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 60,
    }).start();
  }, [isSearching, booking, reveal]);

  // ── Auto-apply the Care Points reserved back on the review step ──
  const autoAppliedRef = useRef(false);
  const reservedHours = Number(pointsHours ?? 0);
  useEffect(() => {
    if (autoAppliedRef.current || !booking) return;
    if (booking.status !== BookingStatus.APPROVED) return;
    if (booking.rewardCreditAmount > 0) return;
    if (!Number.isFinite(reservedHours) || reservedHours < 1) return;
    // Guarded by a ref rather than state: the 5s poll re-runs this effect on
    // every refetch, and a second redeem would spend the points twice.
    autoAppliedRef.current = true;
    const hours = Math.min(Math.floor(reservedHours), Math.floor(booking.durationHours));
    if (hours >= 1) redeem.mutate({ id: booking.id, hours });
  }, [booking, reservedHours, redeem]);

  const handleViewDetails = () => {
    router.push({
      pathname: '/(parent)/book/booking-detail',
      params: { bookingId: bookingId ?? '' },
    } as never);
  };

  const handleCompletePayment = useCallback(() => {
    if (!booking) return;
    router.push({
      pathname: '/(parent)/book/booking-step-3',
      params: payBookingParams(booking) as never,
    } as never);
  }, [booking, router]);

  const handleCancelRequest = () => {
    if (!booking) return;
    cancelBooking.mutate(
      { id: booking.id, reason: 'Cancelled by parent' },
      { onSuccess: () => router.replace('/(parent)/home') },
    );
  };

  const handleBackToHome = () => {
    router.replace('/(parent)/home');
  };

  if (isLoading || !booking) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const nannyFirstName = booking.nanny?.firstName ?? 'your nanny';
  const nannyPhoto = booking.nanny?.avatarUrl ?? '';
  const dateDisplay = fmtBookingDate(booking.date);
  const timeDisplay = fmtBookingTime(booking.startTime, booking.endTime);
  const totalDisplay = formatMoney(booking.totalAmount);

  // Payment is the final step once a nanny has claimed the request. A PENDING
  // booking is still being broadcast (no nanny yet); an APPROVED booking has
  // been claimed and is waiting on the parent's payment.
  const isPaid =
    booking.status === BookingStatus.CONFIRMED ||
    booking.status === BookingStatus.IN_PROGRESS ||
    booking.status === BookingStatus.COMPLETED ||
    booking.payment?.status === PaymentStatus.CAPTURED;
  const isApproved = booking.status === BookingStatus.APPROVED;
  const isPending = !isPaid && !isApproved;

  let heading: string;
  let subtitle: string;
  if (isPaid) {
    heading = "You're booked.";
    subtitle = `${nannyFirstName} is confirmed for ${dateDisplay}.`;
  } else if (isApproved) {
    heading = 'A nanny accepted!';
    subtitle = `${nannyFirstName} is ready for ${dateDisplay}. Complete payment to confirm.`;
  } else {
    heading = 'Finding a nanny';
    subtitle = SEARCH_MESSAGES[messageIndex] ?? SEARCH_MESSAGES[0];
  }

  /** Which "what happens next" step is live right now. */
  const activeStep = isPaid ? 2 : isApproved ? 1 : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ── */}
      <View style={styles.hero}>
        {isPending ? (
          <PulseRings size={104} maxScale={2.2} active>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCore}
            >
              <Ionicons name="radio-outline" size={34} color={colors.white} />
            </LinearGradient>
          </PulseRings>
        ) : (
          <Animated.View
            style={[
              styles.revealWrap,
              {
                opacity: reveal,
                transform: [
                  { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                ],
              },
            ]}
          >
            {nannyPhoto ? (
              <Image source={{ uri: nannyPhoto }} style={styles.heroAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.heroAvatar, styles.heroAvatarPlaceholder]}>
                <Ionicons name="person" size={40} color={colors.primary} />
              </View>
            )}
            <View style={styles.heroBadge}>
              <Ionicons
                name={isPaid ? 'checkmark' : 'sparkles'}
                size={14}
                color={colors.white}
              />
            </View>
          </Animated.View>
        )}

        <Text style={styles.heading}>{heading}</Text>
        {isPending ? (
          <Animated.Text style={[styles.subtitle, { opacity: messageFade }]}>
            {subtitle}
          </Animated.Text>
        ) : (
          <Text style={styles.subtitle}>{subtitle}</Text>
        )}

        {isPending && (
          <View style={styles.elapsedPill}>
            <View style={styles.liveDot} />
            <Text style={styles.elapsedText}>Searching for {formatElapsed(elapsed)}</Text>
          </View>
        )}
      </View>

      {/* ── Booking card ── */}
      <View style={styles.card}>
        <View style={styles.nannyHeader}>
          <View style={styles.photoWrapper}>
            {nannyPhoto ? (
              <Image source={{ uri: nannyPhoto }} style={styles.nannyPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.nannyPhoto, styles.nannyPhotoPlaceholder]}>
                <Ionicons
                  name={isPending ? 'search' : 'person'}
                  size={24}
                  color={colors.primary}
                />
              </View>
            )}
          </View>
          <View style={styles.nannyHeaderBody}>
            <Text style={styles.nannyName}>
              {booking.nanny
                ? `${booking.nanny.firstName} ${booking.nanny.lastName}`
                : 'Searching for a nanny…'}
            </Text>
            <Text style={styles.nannyMeta}>
              {isPending ? 'Your request is out to every available nanny' : 'Your nanny'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsList}>
          <DetailRow iconName="calendar-outline" label="Date" value={dateDisplay} />
          <DetailRow iconName="time-outline" label="Time" value={timeDisplay} />
          <DetailRow
            iconName="wallet-outline"
            label={isPaid ? 'Charged' : 'Total'}
            value={totalDisplay}
          />
        </View>
      </View>

      {/* ── What happens next ── */}
      {isPending && (
        <View style={styles.timeline}>
          <Text style={styles.timelineTitle}>What happens next</Text>
          {NEXT_STEPS.map((step, index) => {
            const done = index < activeStep;
            const active = index === activeStep;
            return (
              <View key={step.title} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      (done || active) && styles.timelineDotReached,
                    ]}
                  >
                    {done && <Ionicons name="checkmark" size={11} color={colors.white} />}
                  </View>
                  {index < NEXT_STEPS.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <Text
                    style={[styles.timelineStep, active && styles.timelineStepActive]}
                  >
                    {step.title}
                  </Text>
                  <Text style={styles.timelineDetail}>{step.detail}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Care Points redemption (before payment) ── */}
      {isApproved && (
        <CarePointsCard booking={booking} autoApplying={redeem.isPending} />
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        {isApproved ? (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={handleCompletePayment}
          >
            <Ionicons name="card-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Complete payment</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={handleViewDetails}
          >
            <Ionicons name="eye-outline" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>View booking details</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.linkButton} activeOpacity={0.7} onPress={handleBackToHome}>
          <Text style={styles.linkButtonText}>Back to home</Text>
        </TouchableOpacity>

        {isPending && (
          <TouchableOpacity
            style={styles.linkButton}
            activeOpacity={0.7}
            onPress={handleCancelRequest}
            disabled={cancelBooking.isPending}
          >
            <Text style={styles.cancelLinkText}>
              {cancelBooking.isPending ? 'Cancelling…' : 'Cancel request'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

// ─── CarePointsCard ─────────────────────────────────────────────────────────────

/**
 * Lets the parent apply Care Points to an approved booking before paying. The
 * server lowers the booking total; whatever provider then charges bills the
 * reduced amount. Points are refunded via "Remove" or on cancellation.
 *
 * Hours reserved back on the review step are applied for her automatically —
 * `autoApplying` keeps this card quiet while that request is in flight.
 */
function CarePointsCard({
  booking,
  autoApplying = false,
}: {
  booking: BookingResponse;
  autoApplying?: boolean;
}) {
  const wallet = useRewardWallet();
  const config = useRewardConfig();
  const redeem = useRedeemBookingPoints();
  const refund = useRefundBookingPoints();
  const [hours, setHours] = useState(1);

  const applied = booking.rewardCreditAmount > 0;
  const pph = config.data?.redemptionPointsPerHour ?? 0;
  const enabled = config.data?.enabled ?? false;
  const balance = wallet.data?.pointsBalance ?? 0;
  const maxHours =
    pph > 0 ? Math.min(Math.floor(balance / pph), Math.floor(booking.durationHours)) : 0;
  const clamped = Math.min(Math.max(hours, 1), Math.max(maxHours, 1));
  const saving = clamped * booking.effectiveHourlyRate;

  if (applied) {
    return (
      <View style={[styles.rewardCard, styles.rewardCardApplied]}>
        <Ionicons name="gift" size={22} color={colors.successDark} />
        <View style={styles.rewardAppliedBody}>
          <Text style={styles.rewardTitle}>
            {booking.rewardCreditHoursApplied} free hour
            {booking.rewardCreditHoursApplied === 1 ? '' : 's'} applied
          </Text>
          <Text style={styles.rewardSub}>
            You saved {formatMoney(booking.rewardCreditAmount)} with {booking.rewardCreditPoints}{' '}
            points.
          </Text>
        </View>
        <TouchableOpacity onPress={() => refund.mutate(booking.id)} disabled={refund.isPending}>
          <Text style={styles.rewardRemove}>{refund.isPending ? '…' : 'Remove'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (autoApplying) {
    return (
      <View style={[styles.rewardCard, styles.rewardCardApplied]}>
        <ActivityIndicator color={colors.successDark} />
        <Text style={styles.rewardSub}>Applying your reserved Care Points…</Text>
      </View>
    );
  }

  if (!enabled || maxHours < 1) return null;

  return (
    <View style={styles.rewardCard}>
      <View style={styles.rewardHeaderRow}>
        <Ionicons name="gift-outline" size={18} color={colors.goldWarm} />
        <Text style={styles.rewardTitle}>Use Care Points</Text>
        <Text style={styles.rewardBalance}>{balance} pts</Text>
      </View>
      <Text style={styles.rewardSub}>
        Redeem up to {maxHours} free hour{maxHours === 1 ? '' : 's'} ({pph} pts each).
      </Text>
      <View style={styles.rewardControls}>
        <Stepper
          value={clamped}
          onChange={setHours}
          min={1}
          max={Math.max(maxHours, 1)}
          suffix="h"
          size="sm"
        />
        <TouchableOpacity
          style={styles.rewardApplyBtn}
          onPress={() => redeem.mutate({ id: booking.id, hours: clamped })}
          disabled={redeem.isPending}
        >
          <Text style={styles.rewardApplyText}>
            {redeem.isPending ? 'Applying…' : `Apply · −${formatMoney(saving)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
        <Ionicons name={iconName} size={16} color={colors.textMuted} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}
