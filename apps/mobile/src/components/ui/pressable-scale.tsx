import React, { forwardRef, useCallback, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import type { GestureResponderEvent, PressableProps, View } from 'react-native';

import { motion } from '@mobile/theme';
import { hapticSelect, hapticTap } from '@mobile/lib/haptics';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends PressableProps {
  /** Haptic tick fired on press: `tap` for actions, `select` for toggles/tabs. */
  haptic?: 'tap' | 'select';
  /** Scale the element settles to while held. Defaults to `motion.pressScale`. */
  scaleTo?: number;
}

/**
 * Drop-in `Pressable` that eases down to a slightly smaller size while held
 * and springs back on release — the app's standard press feedback for
 * buttons, cards and tiles. Style and children callbacks still receive
 * `{ pressed }`, so existing pressed styles keep working.
 *
 * Under the OS Reduce Motion setting it skips the scale and dims instead.
 */
const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { haptic, scaleTo = motion.pressScale, style, children, onPress, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const springTo = useCallback(
    (toValue: number) => {
      Animated.spring(scale, { toValue, ...motion.spring.press, useNativeDriver: true }).start();
    },
    [scale],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      if (!reducedMotion) springTo(scaleTo);
      onPressIn?.(event);
    },
    [reducedMotion, springTo, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      if (!reducedMotion) springTo(1);
      onPressOut?.(event);
    },
    [reducedMotion, springTo, onPressOut],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic === 'tap') hapticTap();
      else if (haptic === 'select') hapticSelect();
      onPress?.(event);
    },
    [haptic, onPress],
  );

  // `hovered` exists on the web typing of the callback state; native never hovers.
  const pressState = { pressed, hovered: false };
  const resolvedStyle = typeof style === 'function' ? style(pressState) : style;
  const resolvedChildren = typeof children === 'function' ? children(pressState) : children;
  const feedback = reducedMotion
    ? pressed
      ? { opacity: 0.85 }
      : undefined
    : { transform: [{ scale }] };

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPress={onPress ? handlePress : undefined}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, feedback]}
    >
      {resolvedChildren}
    </AnimatedPressable>
  );
});

export default PressableScale;
