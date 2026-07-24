import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';

import { colors, borderRadius } from '@mobile/theme';

interface PulseRingsProps {
  /** Diameter of the innermost (static) core, in px. */
  size?: number;
  /** How far the rings expand, as a multiple of `size`. */
  maxScale?: number;
  /** Number of staggered rings. */
  count?: number;
  /** One full expand cycle, in ms. */
  duration?: number;
  active?: boolean;
  children?: ReactNode;
}

/**
 * Sonar rings expanding out from a centre — the "we're reaching out to nannies"
 * state. Transform + opacity only, so the whole loop runs on the native driver
 * and keeps animating while JS is busy polling.
 */
export default function PulseRings({
  size = 96,
  maxScale = 2.4,
  count = 3,
  duration = 2600,
  active = true,
  children,
}: PulseRingsProps) {
  // One driver per ring, created once and reused across renders.
  const drivers = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    if (!active) {
      drivers.forEach((d) => d.setValue(0));
      return;
    }

    const loops = drivers.map((driver, index) =>
      Animated.loop(
        Animated.sequence([
          // Stagger so the rings trail each other rather than pulsing as one.
          Animated.delay((duration / count) * index),
          Animated.timing(driver, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(driver, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [active, count, drivers, duration]);

  return (
    <View style={[styles.wrap, { width: size * maxScale, height: size * maxScale }]}>
      {drivers.map((driver, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              opacity: driver.interpolate({
                inputRange: [0, 1],
                outputRange: [0.45, 0],
              }),
              transform: [
                {
                  scale: driver.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, maxScale],
                  }),
                },
              ],
            },
          ]}
        />
      ))}

      <View style={[styles.core, { width: size, height: size }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  core: {
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
