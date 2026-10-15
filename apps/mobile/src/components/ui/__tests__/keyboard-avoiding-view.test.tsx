import React from 'react';
import { Keyboard, KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';
import type { KeyboardEventName } from 'react-native';
import { act, render } from '@testing-library/react-native';

import KeyboardAvoidingView from '@mobile/components/ui/keyboard-avoiding-view';

describe('KeyboardAvoidingView', () => {
  const handlers = new Map<KeyboardEventName, () => void>();

  beforeEach(() => {
    handlers.clear();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
      handlers.set(event, handler as () => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const fire = (event: KeyboardEventName) => act(() => handlers.get(event)?.());

  // Android's keyboardDidHide reports a keyboard top above the screen's bottom
  // edge, so React Native's own padding never returned to zero.
  it('pads only while the keyboard is up', () => {
    const screen = render(<KeyboardAvoidingView />);
    const avoider = () => screen.UNSAFE_getByType(RNKeyboardAvoidingView);
    expect(avoider().props.enabled).toBe(false);

    fire('keyboardDidShow');
    expect(avoider().props.enabled).toBe(true);
    expect(avoider().props.behavior).toBe('padding');

    fire('keyboardDidHide');
    expect(avoider().props.enabled).toBe(false);
  });

  it('starts padding as soon as iOS announces the keyboard', () => {
    const screen = render(<KeyboardAvoidingView />);
    fire('keyboardWillShow');
    expect(screen.UNSAFE_getByType(RNKeyboardAvoidingView).props.enabled).toBe(true);
  });

  it('stays off when the caller turns it off', () => {
    const screen = render(<KeyboardAvoidingView enabled={false} />);
    fire('keyboardDidShow');
    expect(screen.UNSAFE_getByType(RNKeyboardAvoidingView).props.enabled).toBe(false);
  });
});
