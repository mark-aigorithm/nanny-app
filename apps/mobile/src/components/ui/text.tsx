import React, { forwardRef } from 'react';
import { Animated, Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextInputProps, TextProps } from 'react-native';

/**
 * How far text follows the OS font-size setting. Text still grows for people
 * who enlarge it, up to this factor; every screen is laid out to fit a
 * 360pt-wide phone at this scale. Past it, fixed-size controls (steppers,
 * price rows, tab labels) would crowd or wrap on narrow Android phones.
 */
export const MAX_FONT_SCALE = 1.3;

/*
 * The app's only Text and TextInput. React 19 ignores `defaultProps` on
 * function components, so the cap cannot be set once on React Native's own
 * components — every file imports these instead (enforced by
 * src/__tests__/layout-guards.test.ts). A caller can still pass its own
 * `maxFontSizeMultiplier`.
 */

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

// Same-named types, so `useRef<TextInput>(null)` keeps working after the swap.
export type Text = RNText;
export type TextInput = RNTextInput;

/** `Animated.Text` with the same cap. */
export const AnimatedText = Animated.createAnimatedComponent(Text);

