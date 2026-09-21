import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import OfflineScreen from '@mobile/screens/OfflineScreen';

it('shows the friendly copy and a Try again button', () => {
  const { getByText } = render(<OfflineScreen onRetry={jest.fn(async () => undefined)} />);

  expect(getByText("You're offline")).toBeTruthy();
  expect(
    getByText("Check your Wi‑Fi or mobile data and we'll pick up right where you left off."),
  ).toBeTruthy();
  expect(getByText('Try again')).toBeTruthy();
});

it('calls onRetry and shows a spinner in the button until it settles', async () => {
  let settle: (() => void) | undefined;
  const onRetry = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  const { getByText, queryByText } = render(<OfflineScreen onRetry={onRetry} />);

  fireEvent.press(getByText('Try again'));

  expect(onRetry).toHaveBeenCalledTimes(1);
  // Button swaps its label for an ActivityIndicator while `loading`.
  await waitFor(() => expect(queryByText('Try again')).toBeNull());

  await act(async () => {
    settle?.();
  });
  expect(getByText('Try again')).toBeTruthy();
});
