import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';

import {
  colors,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
} from '@mobile/theme';
import { useBookingList, useCheckOut } from '@mobile/hooks/useBookings';
import { confirmEndShift } from '@mobile/components/UpcomingShiftBanner';

function getElapsed(startIso: string | null): string {
  if (!startIso) return 'Just started';
  const ms = Date.now() - new Date(startIso).getTime();
  if (ms < 0) return 'Just started';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'Just started';
  if (mins < 60) return `${mins} min in`;
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin === 0 ? `${hrs}h in` : `${hrs}h ${remMin}m in`;
}

function pickActive(bookings: BookingResponse[]): BookingResponse | null {
  return bookings.find((b) => b.status === 'IN_PROGRESS') ?? null;
}

interface Props {
  href?: string;
  onPressBooking?: (booking: BookingResponse) => void;
}

export default function OngoingBookingBanner({
  href = '/(nanny)/care-log',
  onPressBooking,
}: Props) {
  const router = useRouter();
  const checkOut = useCheckOut();
  const { data: bookings = [] } = useBookingList('IN_PROGRESS');
  const active = pickActive(bookings);

  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  if (!active) return null;

  const isParentView = !!onPressBooking;
  const subjectName = isParentView
    ? (active.nanny ? `${active.nanny.firstName} ${active.nanny.lastName}` : 'Your nanny')
    : `${active.motherFirstName} ${active.motherLastName}`;
  const title = isParentView
    ? `${subjectName} is on shift`
    : `Caring for ${subjectName}'s family`;
  const cta = isParentView ? 'Tap to view details' : 'Tap to open care log';
  const elapsedLabel = getElapsed(active.nannyCheckedInAt);
  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
        onPress={() => {
          if (onPressBooking) {
            onPressBooking(active);
            return;
          }
          router.push(href as never);
        }}
        accessibilityRole="button"
        accessibilityLabel={isParentView ? `View booking details for ${subjectName}` : `Open care log for ongoing booking with ${subjectName}`}
      >
        <View style={styles.liveWrap}>
          <Animated.View
            style={[
              styles.liveHalo,
              { transform: [{ scale: dotScale }], opacity: dotOpacity },
            ]}
          />
          <View style={styles.liveDot} />
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.eyebrow}>ON SHIFT</Text>
            <View style={styles.eyebrowDivider} />
            <Text style={styles.elapsed}>{elapsedLabel}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.cta}>{cta}</Text>
        </View>

        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </View>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.endButton, pressed && styles.pressed]}
        onPress={() => confirmEndShift(active, checkOut)}
        disabled={checkOut.isPending}
        accessibilityRole="button"
        accessibilityLabel="End shift"
      >
        {checkOut.isPending ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.endButtonText}>End shift</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successDark,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  pressed: {
    opacity: 0.9,
  },
  liveWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveHalo: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.liveGreen,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.liveGreen,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fontFamily.extraBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.liveGreen,
  },
  eyebrowDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  elapsed: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.white,
  },
  cta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  endButton: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  endButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: colors.white,
  },
});
