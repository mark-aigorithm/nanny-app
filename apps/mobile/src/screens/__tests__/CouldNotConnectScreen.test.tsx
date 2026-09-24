import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import CouldNotConnectScreen from '@mobile/screens/CouldNotConnectScreen';

it('explains the failure and offers Retry and Sign out', async () => {
  const onRetry = jest.fn();
  const onSignOut = jest.fn();
  const { getByText } = render(
    <CouldNotConnectScreen onRetry={onRetry} onSignOut={onSignOut} isSigningOut={false} />,
  );
  // Let the icon font load settle inside act().
  await act(async () => {});

  expect(getByText("Couldn't connect")).toBeTruthy();
  expect(getByText("Couldn't connect. Check your connection and try again.")).toBeTruthy();

  fireEvent.press(getByText('Retry'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  fireEvent.press(getByText('Sign out'));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});

it('holds both buttons while signing out', async () => {
  const onRetry = jest.fn();
  const { getByText } = render(
    <CouldNotConnectScreen onRetry={onRetry} onSignOut={jest.fn()} isSigningOut />,
  );
  await act(async () => {});

  fireEvent.press(getByText('Retry'));
  expect(onRetry).not.toHaveBeenCalled();
});
