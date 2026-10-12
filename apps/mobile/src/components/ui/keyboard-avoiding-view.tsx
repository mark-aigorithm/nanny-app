import React from 'react';
import { KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';
import type { KeyboardAvoidingViewProps } from 'react-native';

/**
 * The app's KeyboardAvoidingView. The app draws edge-to-edge, and on Android
 * that means the window no longer shrinks when the keyboard opens — the old
 * `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` left every input
 * near the bottom (a comment box, a chat composer, the last form field) behind
 * the keyboard. Padding by the keyboard's overlap works the same on both
 * platforms, so it is the default here.
 */
export default function KeyboardAvoidingView({
  behavior = 'padding',
  ...props
}: KeyboardAvoidingViewProps) {
  return <RNKeyboardAvoidingView behavior={behavior} {...props} />;
}
