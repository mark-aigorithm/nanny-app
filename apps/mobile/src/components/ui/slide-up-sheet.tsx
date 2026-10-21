import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { borderRadius, colors, motion, shadows } from '@mobile/theme';

interface SlideUpSheetProps {
  /** Plays the exit, then calls `onClosed`; the host unmounts the sheet there. */
  closing?: boolean;
  onClosed?: () => void;
  /** Makes the scrim a "close" button; without it, taps on the scrim do nothing. */
  onBackdropPress?: () => void;
  backdropLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A bottom sheet's scrim and panel, for inside a Modal with
 * `animationType="none"`. The scrim only fades and the panel slides, in and
 * out: a Modal's own "slide" carries the scrim down the screen with the sheet.
 * Under Reduce Motion both only fade.
 */
export default function SlideUpSheet({
  closing = false,
  onClosed,
  onBackdropPress,
  backdropLabel = 'Close',
  style,
  children,
}: SlideUpSheetProps) {
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  // Until measured, slide from the bottom of the window.
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: closing ? 0 : 1,
      // Exits are quicker than entrances, so a dismissal feels immediate.
      duration: closing ? motion.duration.base : motion.duration.slow,
      easing: closing ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && closing) onClosedRef.current?.();
    });
    return () => animation.stop();
  }, [closing, progress]);

  const onLayout = (e: LayoutChangeEvent) => setSheetHeight(e.nativeEvent.layout.height);
  const travel = sheetHeight ?? windowHeight;
  const panelMotion = reducedMotion
    ? { opacity: progress }
    : {
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
        ],
      };

  return (
    <>
      <Animated.View style={[styles.scrim, { opacity: progress }]}>
        {onBackdropPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closing ? undefined : onBackdropPress}
            accessibilityRole="button"
            accessibilityLabel={backdropLabel}
          />
        ) : null}
      </Animated.View>
      <Animated.View
        style={[styles.panel, style, panelMotion]}
        onLayout={onLayout}
        pointerEvents={closing ? 'none' : 'auto'}
      >
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...shadows.lg,
  },
});
