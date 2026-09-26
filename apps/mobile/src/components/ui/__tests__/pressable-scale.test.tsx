import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import PressableScale from '@mobile/components/ui/pressable-scale';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PressableScale', () => {
  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale onPress={onPress}>
        <Text>Book care</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('Book care'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires a light impact for haptic="tap"', () => {
    const { getByText } = render(
      <PressableScale haptic="tap" onPress={() => {}}>
        <Text>Pay</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('Pay'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('fires a selection tick for haptic="select"', () => {
    const { getByText } = render(
      <PressableScale haptic="select" onPress={() => {}}>
        <Text>Past</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('Past'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('stays silent without a haptic prop', () => {
    const { getByText } = render(
      <PressableScale onPress={() => {}}>
        <Text>Open</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('Open'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('does not fire onPress or a haptic when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <PressableScale haptic="tap" disabled onPress={onPress}>
        <Text>Book care</Text>
      </PressableScale>,
    );
    fireEvent.press(getByText('Book care'));
    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('passes the pressed state to style and children callbacks', () => {
    const style = jest.fn(() => undefined);
    const { getByText } = render(
      <PressableScale onPress={() => {}} style={style}>
        {({ pressed }) => <Text>{pressed ? 'Held' : 'Idle'}</Text>}
      </PressableScale>,
    );
    expect(style).toHaveBeenLastCalledWith(expect.objectContaining({ pressed: false }));
    fireEvent(getByText('Idle'), 'pressIn');
    expect(getByText('Held')).toBeTruthy();
    expect(style).toHaveBeenLastCalledWith(expect.objectContaining({ pressed: true }));
  });
});
