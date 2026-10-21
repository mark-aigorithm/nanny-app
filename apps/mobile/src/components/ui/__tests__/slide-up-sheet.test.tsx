/**
 * The scrim only fades and the panel slides, so dismissal never drags the dark
 * backdrop down the screen. `onClosed` runs once the exit has played.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Text } from '@mobile/components/ui/text';
import SlideUpSheet from '@mobile/components/ui/slide-up-sheet';

afterEach(() => jest.useRealTimers());

it('calls onClosed only after the exit has played', () => {
  jest.useFakeTimers();
  const onClosed = jest.fn();
  const { rerender } = render(
    <SlideUpSheet onClosed={onClosed}>
      <Text>Body</Text>
    </SlideUpSheet>,
  );
  rerender(
    <SlideUpSheet closing onClosed={onClosed}>
      <Text>Body</Text>
    </SlideUpSheet>,
  );
  expect(onClosed).not.toHaveBeenCalled();
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(onClosed).toHaveBeenCalledTimes(1);
});

it('makes the scrim a labelled close button only when asked to', () => {
  const onBackdropPress = jest.fn();
  const { rerender } = render(
    <SlideUpSheet>
      <Text>Body</Text>
    </SlideUpSheet>,
  );
  expect(screen.queryByRole('button')).toBeNull();

  rerender(
    <SlideUpSheet onBackdropPress={onBackdropPress} backdropLabel="Later">
      <Text>Body</Text>
    </SlideUpSheet>,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Later' }));
  expect(onBackdropPress).toHaveBeenCalledTimes(1);
});
