import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { Text } from '@mobile/components/ui/text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';

import { colors, fontFamily, spacing, borderRadius, shadows } from '@mobile/theme';
import { useBookingList, fmtBookingDate } from '@mobile/hooks/useBookings';
import ParentStartPinCard from '@mobile/components/ParentStartPinCard';
import { AmountDueCard } from '@mobile/components/booking/AmountDueCard';
import PressableScale from '@mobile/components/ui/pressable-scale';

// The mother's live order, Uber-style: always visible on Home so she can jump
// back to "finding a nanny", pay the moment one accepts, or track the visit.
const ACTIVE_STATUSES = 'PENDING,APPROVED,CONFIRMED,IN_PROGRESS';

// Most actionable first: pay-now beats a live visit beats searching beats upcoming.
const PRIORITY: Record<string, number> = {
  APPROVED: 0,
  IN_PROGRESS: 1,
  PENDING: 2,
  CONFIRMED: 3,
};

/**
 * An unpaid balance-due outranks everything: it is money owed on a booking that
 * is otherwise about to start and will be refused at the door until she pays.
 */
function rank(b: BookingResponse): number {
  if (b.balanceDue) return -1;
  return PRIORITY[b.status] ?? 9;
}

function pickActive(bookings: BookingResponse[]): BookingResponse | null {
  return [...bookings].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/** Still broadcast to nannies: no one has accepted, and nothing is owed. */
function isSearching(b: BookingResponse): boolean {
  return b.status === 'PENDING' && !b.balanceDue;
}

/**
 * The line under the card for every active booking the card isn't showing —
 * one card can only speak for one booking, so without this a second request
 * still searching for a nanny was invisible from Home.
 */
function othersLine(others: BookingResponse[]): string | null {
  if (others.length === 0) return null;
  const n = others.length;
  if (others.every(isSearching)) {
    return n === 1
      ? '1 more request is still finding a nanny'
      : `${n} more requests are still finding a nanny`;
  }
  return n === 1 ? '1 more active booking' : `${n} more active bookings`;
}

type Look = {
  dark: boolean;
  eyebrow: string;
  title: string;
  cta: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  pulse: boolean;
};

function lookFor(b: BookingResponse): Look {
  const nanny = b.nanny ? `${b.nanny.firstName} ${b.nanny.lastName}` : 'your nanny';

  // Checked before status: an admin edit that raised the total leaves the
  // booking CONFIRMED but unpaid, and it cannot start until she settles it.
  // Showing "UPCOMING · Tap to view" there is what made Home look fine while
  // the shift was silently blocked.
  if (b.balanceDue) {
    return {
      dark: true,
      eyebrow: 'PAYMENT DUE',
      title: 'Your booking was updated',
      cta: 'Complete your payment to start',
      icon: 'alert-circle',
      pulse: false,
    };
  }

  switch (b.status) {
    case 'APPROVED':
      return {
        dark: true,
        eyebrow: 'NANNY FOUND',
        title: `${nanny} is ready`,
        cta: 'Tap to pay & confirm',
        icon: 'card',
        pulse: false,
      };
    case 'IN_PROGRESS':
      return {
        dark: true,
        eyebrow: 'IN PROGRESS',
        title: `${nanny} is with your child`,
        cta: 'Tap to view',
        icon: 'ellipse',
        pulse: true,
      };
    case 'CONFIRMED':
      return {
        dark: false,
        eyebrow: 'UPCOMING',
        title: `${nanny} · ${fmtBookingDate(b.date)}`,
        cta: 'Tap to view',
        icon: 'calendar',
        pulse: false,
      };
    default:
      return {
        dark: false,
        eyebrow: 'FINDING A NANNY',
        title: 'Reaching out to nannies…',
        cta: 'Tap to view',
        icon: 'search',
        pulse: true,
      };
  }
}

export default function ParentActiveBookingCard() {
  const router = useRouter();
  // Poll so the card flips from "finding" to "nanny found — pay" on its own.
  const { data = [] } = useBookingList(ACTIVE_STATUSES, undefined, 6000);
  const active = pickActive(data);
  // Several requests all still searching read as one card for all of them —
  // "Reaching out to nannies…" about one would hide the rest.
  const searchingCount = data.filter(isSearching).length;
  const groupSearching = !!active && isSearching(active) && searchingCount > 1;
  const others = active && !groupSearching ? data.filter((b) => b.id !== active.id) : [];
  const moreLine = othersLine(others);

  const pulse = useRef(new Animated.Value(0)).current;
  const shouldPulse = !!active && lookFor(active).pulse;

  useEffect(() => {
    if (!shouldPulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldPulse, pulse]);

  if (!active) return null;

  const look: Look = groupSearching
    ? {
        ...lookFor(active),
        title: `${searchingCount} requests still searching`,
        cta: 'Tap to see them all',
      }
    : lookFor(active);
  const openActivity = () => router.push('/(parent)/(tabs)/bookings' as never);
  const onPress = () => {
    if (groupSearching) {
      openActivity();
      return;
    }
    const isRequestFlow = active.status === 'PENDING' || active.status === 'APPROVED';
    router.push({
      pathname: isRequestFlow
        ? '/(parent)/book/booking-confirmation'
        : '/(parent)/book/booking-detail',
      params: { bookingId: active.id },
    } as never);
  };

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  const textColor = look.dark ? colors.white : colors.textPrimary;
  const subColor = look.dark ? colors.white : colors.textSecondary;

  return (
    <View style={styles.wrap}>
    <PressableScale
      style={[styles.container, look.dark ? styles.containerDark : styles.containerLight]}
      haptic="tap"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${look.eyebrow}: ${look.title}. ${look.cta}`}
    >
      <View style={[styles.iconWrap, look.dark ? styles.iconWrapDark : styles.iconWrapLight]}>
        {look.pulse && (
          <Animated.View
            style={[
              styles.halo,
              { backgroundColor: look.dark ? colors.liveGreen : colors.primaryDark },
              { transform: [{ scale: haloScale }], opacity: haloOpacity },
            ]}
          />
        )}
        <Ionicons
          name={look.icon}
          size={look.icon === 'ellipse' ? 12 : 20}
          color={look.dark ? colors.white : colors.primaryDark}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: look.dark ? colors.liveGreen : colors.primaryDark }]}>
          {look.eyebrow}
        </Text>
        <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
          {look.title}
        </Text>
        <Text style={[styles.cta, { color: subColor }]}>{look.cta}</Text>
      </View>

      <View style={[styles.chevron, look.dark ? styles.chevronDark : styles.chevronLight]}>
        <Ionicons name="chevron-forward" size={18} color={look.dark ? colors.white : colors.primaryDark} />
      </View>
    </PressableScale>

      {moreLine && (
        <Pressable
          style={styles.moreRow}
          onPress={openActivity}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${moreLine}. View all bookings`}
        >
          <Text style={styles.moreText}>{moreLine}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primaryDark} />
        </Pressable>
      )}

      {/* Balance due after an admin edit — replaces the Start gate, which the
          server would refuse while the booking is unsettled. */}
      <AmountDueCard booking={active} />
      <ParentStartPinCard booking={active} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  containerLight: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  containerDark: {
    backgroundColor: colors.primaryDark,
    ...shadows.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapLight: { backgroundColor: colors.primaryMuted },
  iconWrapDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  halo: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  content: { flex: 1, gap: 2 },
  eyebrow: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  cta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronLight: { backgroundColor: colors.primaryMuted },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    marginTop: -spacing.sm,
  },
  moreText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  chevronDark: { backgroundColor: 'rgba(255,255,255,0.15)' },
});
