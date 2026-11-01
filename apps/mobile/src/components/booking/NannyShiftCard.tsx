import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { BookingResponse } from '@nanny-app/shared';

import { PressableScale } from '@mobile/components/ui';
import { Text } from '@mobile/components/ui/text';
import { BookingNannyAvatar } from '@mobile/components/booking/BookingNannyAvatar';
import { ShiftProgress } from '@mobile/components/booking/ShiftProgress';
import { confirmEndShift } from '@mobile/components/UpcomingShiftBanner';
import { useCheckOut } from '@mobile/hooks/useBookings';
import { childrenPhrase } from '@mobile/lib/bookingDetail';
import { borderRadius, colors, shadows, spacing, typeScale } from '@mobile/theme';

/**
 * The top of the nanny's Booking details while her shift runs — the mother's
 * LiveShiftCard seen from the other side: whose family, which children, how
 * long is left, and the two things she does about the shift from here.
 */
export function NannyShiftCard({ booking }: { booking: BookingResponse }) {
  const router = useRouter();
  const checkOut = useCheckOut();

  const mother = {
    firstName: booking.motherFirstName,
    lastName: booking.motherLastName,
    avatarUrl: booking.motherAvatarUrl,
  };
  const place = booking.address?.details?.label ?? booking.address?.area ?? null;
  const withWhom = `With ${childrenPhrase(booking.children, booking.childrenCount, 'the child')}${
    place ? ` at ${place}` : ''
  }`;

  return (
    <View style={styles.card} accessibilityLabel="Shift in progress">
      <View style={styles.top}>
        <View>
          <BookingNannyAvatar
            nanny={mother}
            fallbackColor={colors.primaryAction}
            initialsColor={colors.white}
          />
          <View style={styles.liveDot} />
        </View>
        <View style={styles.who}>
          <Text style={styles.live}>On shift now</Text>
          <Text style={styles.name}>
            {booking.motherFirstName} {booking.motherLastName}
          </Text>
          <Text style={styles.sub}>{withWhom}</Text>
        </View>
      </View>

      <ShiftProgress booking={booking} />

      <PressableScale
        style={styles.primaryAction}
        haptic="tap"
        onPress={() => router.push('/(nanny)/care-log' as never)}
        accessibilityRole="button"
      >
        <Ionicons name="document-text-outline" size={20} color={colors.successDark} />
        <Text style={styles.primaryActionText}>Open care log</Text>
      </PressableScale>

      <View style={styles.footer}>
        <Pressable
          style={styles.footerButton}
          onPress={() => confirmEndShift(booking, checkOut)}
          disabled={checkOut.isPending}
          accessibilityRole="button"
        >
          {checkOut.isPending ? (
            <ActivityIndicator color={colors.warmLight} />
          ) : (
            <>
              <Ionicons name="stop-circle-outline" size={18} color={colors.warmLight} />
              <Text style={styles.endText}>End shift</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same green card as the mother's LiveShiftCard.
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
  primaryAction: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
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
    flexShrink: 1,
  },
  footer: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.overlayLight,
  },
  footerButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  endText: {
    ...typeScale.labelMd,
    color: colors.warmLight,
  },
});
