import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

import { motion } from '@mobile/theme';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

interface FadeInViewProps extends ViewProps {
  /** Position in a list — staggers the entrance. Past `motion.staggerCap`, items enter together. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades its children in while rising a few pixels into place, once, on first
 * mount. Wrap list items and screen sections with it for a calm, staggered
 * entrance. Renders statically under the OS Reduce Motion setting.
 */
export default function FadeInView({ index = 0, style, children, ...rest }: FadeInViewProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.duration.base,
      delay: Math.min(index, motion.staggerCap) * motion.stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // Entrance plays once per mount; a later index change must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const entrance = reducedMotion
    ? undefined
    : {
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [motion.entranceOffset, 0],
            }),
          },
        ],
      };

  return (
    <Animated.View {...rest} style={[style, entrance]}>
      {children}
    </Animated.View>
  );
}
