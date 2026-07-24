import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';

import { colors, fontFamily, typeScale, spacing, borderRadius } from '@mobile/theme';

type Props = {
  step: 1 | 2 | 3 | 4;
  title?: string;
  centered?: boolean;
  compact?: boolean;
};

const STEP_LABELS = ['When', 'Care', 'Review', 'Confirm'] as const;

/**
 * Four-segment progress rail for the booking flow. Completed segments are
 * filled outright; the current one sweeps its fill in on mount so arriving at a
 * step reads as forward motion rather than a static state.
 */
export default function BookingStepProgress({
  step,
  title,
  centered = false,
  compact = false,
}: Props) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      // Animating width can't run on the native driver — it's a layout prop.
      useNativeDriver: false,
    }).start();
  }, [step, sweep]);

  const sweepWidth = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.wrap, centered && styles.wrapCentered]}>
      <View style={styles.rail}>
        {STEP_LABELS.map((label, index) => {
          const n = index + 1;
          const done = n < step;
          const active = n === step;
          return (
            <View key={label} style={styles.segmentColumn}>
              <View style={[styles.segment, compact && styles.segmentCompact]}>
                {done && <View style={styles.segmentFill} />}
                {active && (
                  <Animated.View style={[styles.segmentFill, { width: sweepWidth }]} />
                )}
              </View>
              {!compact && (
                <Text
                  style={[
                    styles.segmentLabel,
                    (done || active) && styles.segmentLabelReached,
                  ]}
                >
                  {label}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {title ? (
        <Text
          style={[
            styles.heading,
            centered && styles.textCentered,
            compact && styles.headingCompact,
          ]}
        >
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    alignSelf: 'stretch',
  },
  wrapCentered: {
    alignItems: 'center',
  },
  textCentered: {
    textAlign: 'center',
  },
  rail: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  segmentColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  segment: {
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.taupe,
    overflow: 'hidden',
  },
  segmentCompact: {
    height: 3,
  },
  segmentFill: {
    height: '100%',
    width: '100%',
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
  },
  segmentLabel: {
    ...typeScale.caption,
    fontFamily: fontFamily.medium,
    color: colors.textPlaceholder,
  },
  segmentLabelReached: {
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  heading: {
    ...typeScale.headingLg,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  headingCompact: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.4,
  },
});
