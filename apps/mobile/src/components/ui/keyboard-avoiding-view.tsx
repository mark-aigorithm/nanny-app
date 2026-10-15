import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';
import type { KeyboardAvoidingViewProps } from 'react-native';

/**
 * Whether the keyboard is up or on its way up. iOS announces it before it
 * moves (`keyboardWill*`), Android only once it has (`keyboardDid*`), so this
 * listens to both and flips at whichever comes first.
 */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', () => setShown(true)),
      Keyboard.addListener('keyboardDidShow', () => setShown(true)),
      Keyboard.addListener('keyboardWillHide', () => setShown(false)),
      Keyboard.addListener('keyboardDidHide', () => setShown(false)),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);
  return shown;
}

/**
 * The app's KeyboardAvoidingView. The app draws edge-to-edge, and on Android
 * that means the window no longer shrinks when the keyboard opens — the old
 * `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` left every input
 * near the bottom (a comment box, a chat composer, the last form field) behind
 * the keyboard. Padding by the keyboard's overlap works the same on both
 * platforms, so it is the default here.
 *
 * It only pads while the keyboard is up. On Android, `keyboardDidHide` reports
 * the keyboard's top as the bottom of the area inside the system bars, not the
 * screen's bottom edge, and React Native pads by the gap between that and the
 * view's bottom. A view that reaches the bottom edge kept a band that tall
 * (about 70dp: the status and navigation bars) under its content after every
 * keyboard close.
 */
export default function KeyboardAvoidingView({
  behavior = 'padding',
  enabled = true,
  ...props
}: KeyboardAvoidingViewProps) {
  const keyboardShown = useKeyboardShown();
  return <RNKeyboardAvoidingView behavior={behavior} enabled={enabled && keyboardShown} {...props} />;
}
