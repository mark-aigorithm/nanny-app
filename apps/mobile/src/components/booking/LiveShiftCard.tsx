import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';
import { Role } from '@nanny-app/shared';

import { PressableScale } from '@mobile/components/ui';
import { BookingNannyAvatar } from '@mobile/components/booking/BookingNannyAvatar';
import { useCareLogs } from '@mobile/hooks/useCareLogs';
import { useNannyPhone } from '@mobile/hooks/useNannyPhone';
import { hourLabel, useShiftActions } from '@mobile/hooks/useShiftActions';
import {
  childrenPhrase,
  elapsedLabel,
  shiftProgress,
  timeLeftLabel,
} from '@mobile/lib/bookingDetail';
import { formatBookingTime } from '@mobile/lib/formatTime';
import { useUserProfileStore } from '@mobile/store/userProfileStore';
import { colors, borderRadius, shadows, spacing, typeScale } from '@mobile/theme';

interface Props {
  booking: BookingResponse;
  /** Pulls a fresh booking so the nanny's number appears once it is released. */
  onRefresh?: () => void;
}

/** Wide enough to redraw the strip each minute, cheap enough to not matter. */
const TICK_MS = 30_000;

/**
 * The top of Booking details while a shift is running — the green "on shift"
 * banner she tapped, opened up. Everything she can do about the shift lives
 * here: who is with her children and for how long, watch the camera, call the
 * nanny, ask for more time or end it.
 *
 * An extension already in flight is not handled here: ParentExtensionCard
 * sits under this card for that, and the Extend / End row steps aside.
 */
export function LiveShiftCard({ booking, onRefresh }: Props) {
  const router = useRouter();
  const role = useUserProfileStore((s) => s.profile?.role);
  const { data: careLogs = [] } = useCareLogs(booking.id);
  const { phone, active: phoneWindow } = useNannyPhone(booking, onRefresh);
  const [picking, setPicking] = useState(false);
  const shift = useShiftActions(booking, () => setPicking(false));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const progress = shiftProgress({
    startTime: booking.startTime,
    endTime: booking.endTime,
    checkedInAt: booking.nannyCheckedInAt,
    moments: careLogs.map((entry) => entry.occurredAt),
    now,
  });

  const nanny = booking.nanny;
  const name = nanny ? `${nanny.firstName} ${nanny.lastName}` : 'Your nanny';
  const place = booking.address?.details?.label ?? booking.address?.area ?? null;
  const withWhom = `With ${childrenPhrase(booking.children, booking.childrenCount)}${
    place ? ` at ${place}` : ''
  }`;
  const canControl = role === Role.MOTHER && !booking.activeExtension;

  const call = () => {
    if (phone) void Linking.openURL(`tel:${phone}`);
  };

  const watchLive = () =>
    router.push({
      pathname: '/nanny/live-video-monitor',
      params: { bookingId: String(booking.id) },
    });

  return (
    <View style={styles.card} accessibilityLabel="Shift in progress">
      <View style={styles.top}>
        <View>
          {nanny ? (
            <BookingNannyAvatar
              nanny={nanny}
              fallbackColor={colors.primary}
              initialsColor={colors.white}
            />
          ) : (
            <View style={styles.avatarEmpty}>
              <Ionicons name="person" size={24} color={colors.white} />
            </View>
          )}
          <View style={styles.liveDot} />
        </View>
        <View style={styles.who}>
          <Text style={styles.live}>On shift now</Text>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {withWhom}
          </Text>
        </View>
      </View>

      <View style={styles.progress}>
        <View style={styles.progressHead}>
          <Text style={styles.left}>{timeLeftLabel(progress.msLeft)}</Text>
          <Text style={styles.sub}>{elapsedLabel(progress.msElapsed)}</Text>
        </View>
        <View
          style={styles.track}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }}
        >
          <View style={[styles.fill, { width: `${progress.fraction * 100}%` }]} />
          {/* A dot for each care-log entry, so the day's updates show on the shift itself. */}
          {progress.ticks.map((at, i) => (
            <View key={i} style={[styles.tick, { left: `${at * 100}%` }]} />
          ))}
          <View style={[styles.now, { left: `${progress.fraction * 100}%` }]} />
        </View>
        <View style={styles.progressFoot}>
          <Text style={styles.sub}>{formatBookingTime(booking.startTime)}</Text>
          <Text style={styles.sub}>{formatBookingTime(booking.endTime)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {booking.hasCamera ? (
          <PressableScale
            style={styles.primaryAction}
            haptic="tap"
            onPress={watchLive}
            accessibilityRole="button"
          >
            <Ionicons name="videocam" size={20} color={colors.successDark} />
            <Text style={styles.primaryActionText}>Watch live</Text>
          </PressableScale>
        ) : null}
        {phoneWindow && nanny ? (
          booking.hasCamera ? (
            <PressableScale
              style={styles.roundAction}
              onPress={call}
              disabled={!phone}
              accessibilityRole="button"
              accessibilityLabel={`Call ${nanny.firstName}`}
            >
              {phone ? (
                <Ionicons name="call" size={20} color={colors.white} />
              ) : (
                <ActivityIndicator color={colors.white} />
              )}
            </PressableScale>
          ) : (
            // No camera to watch, so calling her becomes the main action.
            <PressableScale
              style={styles.primaryAction}
              haptic="tap"
              onPress={call}
              disabled={!phone}
              accessibilityRole="button"
            >
              {phone ? (
                <Ionicons name="call" size={20} color={colors.successDark} />
              ) : (
                <ActivityIndicator color={colors.successDark} />
              )}
              <Text style={styles.primaryActionText}>Call {nanny.firstName}</Text>
            </PressableScale>
          )
        ) : null}
      </View>

      {canControl ? (
        picking ? (
          <View style={styles.footer}>
            <Text style={styles.sub}>How much longer do you need?</Text>
            <View style={styles.hours}>
              {booking.extendableHours.map((hours) => (
                <PressableScale
                  key={hours}
                  style={styles.hourChip}
                  haptic="select"
                  onPress={() => shift.requestHours(hours)}
                  disabled={shift.isRequesting}
                  accessibilityRole="button"
                >
                  <Text style={styles.hourChipText}>{hourLabel(hours)}</Text>
                </PressableScale>
              ))}
            </View>
            <Pressable
              style={styles.footerButton}
              onPress={() => setPicking(false)}
              disabled={shift.isRequesting}
              accessibilityRole="button"
            >
              <Text style={styles.footerText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.footer}>
            {booking.canExtend ? null : (
              // The server decides what's extendable, so say why nothing is on
              // offer rather than showing a button that would only 400.
              <Text style={styles.sub}>This booking can't be extended any further today.</Text>
            )}
            <View style={styles.footerRow}>
              {booking.canExtend ? (
                <>
                  <Pressable
                    style={styles.footerButton}
                    onPress={() => setPicking(true)}
                    accessibilityRole="button"
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                    <Text style={styles.footerText}>Extend booking</Text>
                  </Pressable>
                  <View style={styles.footerDivider} />
                </>
              ) : null}
              <Pressable
                style={styles.footerButton}
                onPress={shift.end}
                disabled={shift.isEnding}
                accessibilityRole="button"
              >
                {shift.isEnding ? (
                  <ActivityIndicator color={colors.warmLight} />
                ) : (
                  <>
                    <Ionicons name="stop-circle-outline" size={18} color={colors.warmLight} />
                    <Text style={[styles.footerText, styles.endText]}>End booking</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )
      ) : null}
    </View>
  );
}

const AVATAR = 52;
const NOW_DOT = 16;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.successDark,
    borderRadius: borderRadius['2xl'],
    padding: spacing.xl,
    gap: spacing.xl,
    ...shadows.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarEmpty: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.liveGreen,
    borderWidth: 2.5,
    borderColor: colors.successDark,
  },
  who: {
    flex: 1,
    gap: spacing.xxs,
  },
  live: {
    ...typeScale.captionBold,
    color: colors.liveGreen,
  },
  name: {
    ...typeScale.headingMd,
    color: colors.white,
  },
  sub: {
    ...typeScale.bodySm,
    color: colors.successLight,
  },
  progress: {
    gap: spacing.sm,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  left: {
    ...typeScale.headingLg,
    color: colors.white,
  },
  track: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.overlayLight,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: borderRadius.full,
    backgroundColor: colors.successLight,
  },
  tick: {
    position: 'absolute',
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: colors.successDark,
  },
  now: {
    position: 'absolute',
    width: NOW_DOT,
    height: NOW_DOT,
    marginLeft: -NOW_DOT / 2,
    borderRadius: NOW_DOT / 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.liveGreen,
  },
  progressFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryAction: {
    flex: 1,
    height: 52,
    borderRadius: borderRadius['2xl'],
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryActionText: {
    ...typeScale.labelLg,
    color: colors.successDark,
  },
  roundAction: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.overlayLight,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerButton: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.overlayLight,
  },
  footerText: {
    ...typeScale.labelMd,
    color: colors.white,
  },
  endText: {
    color: colors.warmLight,
  },
  hours: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hourChip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  hourChipText: {
    ...typeScale.labelMd,
    color: colors.successDark,
  },
});
