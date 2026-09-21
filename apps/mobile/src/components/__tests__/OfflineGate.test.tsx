import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

// Drive the gate through the real hook by faking only the lib/network
// primitives, so a test reads like the device going on and off the network.
const mockReadIsOffline = jest.fn(async () => false);
let mockEmitOffline: ((isOffline: boolean) => void) | undefined;
jest.mock('@mobile/lib/network', () => ({
  readIsOffline: () => mockReadIsOffline(),
  subscribeIsOffline: (listener: (isOffline: boolean) => void) => {
    mockEmitOffline = listener;
    return () => {
      mockEmitOffline = undefined;
    };
  },
}));

import OfflineGate from '@mobile/components/OfflineGate';
import { queryClient } from '@mobile/lib/queryClient';

const HEADLINE = "You're offline";

beforeEach(() => {
  jest.clearAllMocks();
  mockReadIsOffline.mockResolvedValue(false);
  jest.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

it('renders nothing while the device is online', async () => {
  const { queryByText } = render(<OfflineGate />);
  await act(async () => {});

  expect(queryByText(HEADLINE)).toBeNull();
});

it('covers the app when the OS reports the network is gone, and lifts when it returns', async () => {
  const { queryByText } = render(<OfflineGate />);
  await act(async () => {});

  act(() => mockEmitOffline?.(true));
  expect(queryByText(HEADLINE)).toBeTruthy();

  act(() => mockEmitOffline?.(false));
  expect(queryByText(HEADLINE)).toBeNull();
});

it('starts covered when the first read says offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);

  const { findByText } = render(<OfflineGate />);

  expect(await findByText(HEADLINE)).toBeTruthy();
});

it('Try again keeps the screen up and refetches nothing while still offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);
  const { findByText, getByText } = render(<OfflineGate />);
  await findByText(HEADLINE);

  await act(async () => {
    fireEvent.press(getByText('Try again'));
  });

  expect(getByText(HEADLINE)).toBeTruthy();
  expect(queryClient.refetchQueries).not.toHaveBeenCalled();
});

it('Try again lifts the gate and refetches active queries once back online', async () => {
  mockReadIsOffline.mockResolvedValueOnce(true);
  const { findByText, getByText, queryByText } = render(<OfflineGate />);
  await findByText(HEADLINE);

  mockReadIsOffline.mockResolvedValueOnce(false);
  await act(async () => {
    fireEvent.press(getByText('Try again'));
  });

  await waitFor(() => expect(queryByText(HEADLINE)).toBeNull());
  expect(queryClient.refetchQueries).toHaveBeenCalledWith({ type: 'active' });
});
