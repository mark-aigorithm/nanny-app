import { Easing } from 'react-native';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

import { motion } from '@mobile/theme';

/**
 * Calm cross-fade with a small rise: the incoming screen settles up into
 * place while the outgoing one fades and sinks by the same few pixels.
 * `progress` runs -1 → 0 → 1 across a tab's position relative to the focused one.
 */
const forFadeRise: NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']> = ({
  current,
}) => {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [motion.entranceOffset, 0, motion.entranceOffset],
          }),
        },
      ],
    },
  };
};

/**
 * Screen-transition options for a Tabs navigator whose tabs act as screens
 * (the parent group). Turns transitions off entirely under Reduce Motion.
 */
export function fadeRiseTransition(reducedMotion: boolean): BottomTabNavigationOptions {
  if (reducedMotion) return { animation: 'none' };
  return {
    animation: 'fade',
    sceneStyleInterpolator: forFadeRise,
    transitionSpec: {
      animation: 'timing',
      config: { duration: motion.duration.base, easing: Easing.out(Easing.cubic) },
    },
  };
}
