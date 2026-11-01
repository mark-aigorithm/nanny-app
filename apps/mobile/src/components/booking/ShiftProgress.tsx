import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { BookingResponse } from '@nanny-app/shared';

import { Text } from '@mobile/components/ui/text';
import { useCareLogs } from '@mobile/hooks/useCareLogs';
import { elapsedLabel, shiftProgress, timeLeftLabel } from '@mobile/lib/bookingDetail';
import { formatBookingTime } from '@mobile/lib/formatTime';
import { borderRadius, colors, spacing, typeScale } from '@mobile/theme';

/** Wide enough to redraw the strip each minute, cheap enough to not matter. */
const TICK_MS = 30_000;

/**
 * How far into a running shift it is: time left, a strip from start to end
 * with a dot for each care-log entry, and the two ends' clock times. Drawn for
 * the green live card, on either side of the booking.
 */
export function ShiftProgress({ booking }: { booking: BookingResponse }) {
  const { data: careLogs = [] } = useCareLogs(booking.id);

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

  return (
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
  );
}

const NOW_DOT = 16;

const styles = StyleSheet.create({
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
    flexShrink: 1,
  },
  sub: {
    ...typeScale.bodySm,
    color: colors.successLight,
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
});
