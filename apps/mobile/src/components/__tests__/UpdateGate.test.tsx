import React from 'react';
import { BackHandler, Linking, Modal } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AppVersionCheckResult } from '@nanny-app/shared';

let mockCheck: { data?: AppVersionCheckResult; isError?: boolean } = {};
jest.mock('@mobile/hooks/useAppVersionCheck', () => ({
  useAppVersionCheck: () => mockCheck,
}));

const mockReadDismissed = jest.fn(async (): Promise<string | null> => null);
const mockWriteDismissed = jest.fn(async (_version: string) => undefined);
jest.mock('@mobile/lib/dismissedUpdate', () => ({
  readDismissedUpdate: () => mockReadDismissed(),
  writeDismissedUpdate: (version: string) => mockWriteDismissed(version),
}));

import UpdateGate from '@mobile/components/UpdateGate';

const STORE = 'https://apps.apple.com/app/id6797044436';
const REQUIRED_HEADLINE = 'Time to update';
const AVAILABLE_HEADLINE = 'A new version is available';

function result(overrides: Partial<AppVersionCheckResult>): AppVersionCheckResult {
  return { status: 'ok', latestVersion: '1.2.0', storeUrl: STORE, releaseNotes: null, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck = {};
  mockReadDismissed.mockResolvedValue(null);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => jest.restoreAllMocks());

it('renders nothing while the check is loading, failed, or ok', async () => {
  const { queryByText, rerender } = render(<UpdateGate />);
  await act(async () => {});
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();

  mockCheck = { isError: true };
  rerender(<UpdateGate />);
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();

  mockCheck = { data: result({ status: 'ok', storeUrl: null }) };
  rerender(<UpdateGate />);
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
});

it('blocks with notes and sends "Update now" to the store', async () => {
  mockCheck = { data: result({ status: 'update_required', releaseNotes: 'Chat with your nanny' }) };
  const { findByText, getByText } = render(<UpdateGate />);

  expect(await findByText(REQUIRED_HEADLINE)).toBeTruthy();
  expect(getByText('Chat with your nanny')).toBeTruthy();
  fireEvent.press(getByText('Update now'));
  expect(Linking.openURL).toHaveBeenCalledWith(STORE);
  expect(() => getByText('Later')).toThrow();
});

it('swallows the Android back button while blocking', async () => {
  const add = jest.spyOn(BackHandler, 'addEventListener');
  mockCheck = { data: result({ status: 'update_required' }) };
  const { findByText } = render(<UpdateGate />);
  await findByText(REQUIRED_HEADLINE);

  const handler = add.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
  expect(handler?.()).toBe(true);
});

it('offers an optional update; "Later" remembers the version and hides it', async () => {
  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.2.0' }) };
  const { findByText, getByText, queryByText } = render(<UpdateGate />);

  expect(await findByText(AVAILABLE_HEADLINE)).toBeTruthy();
  await act(async () => {
    fireEvent.press(getByText('Later'));
  });

  expect(mockWriteDismissed).toHaveBeenCalledWith('1.2.0');
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
});

it('stays quiet for a version already dismissed, but prompts for a newer one', async () => {
  mockReadDismissed.mockResolvedValue('1.2.0');
  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.2.0' }) };
  const { queryByText, rerender, findByText } = render(<UpdateGate />);
  await act(async () => {});
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();

  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.3.0' }) };
  rerender(<UpdateGate />);
  expect(await findByText(AVAILABLE_HEADLINE)).toBeTruthy();
});

it('still blocks when the same version was dismissed as optional before being made mandatory', async () => {
  mockReadDismissed.mockResolvedValue('1.2.0');
  mockCheck = { data: result({ status: 'update_required', latestVersion: '1.2.0' }) };
  const { findByText } = render(<UpdateGate />);
  expect(await findByText(REQUIRED_HEADLINE)).toBeTruthy();
});

it('renders nothing when the backend sends no store link', async () => {
  mockCheck = { data: result({ status: 'update_required', storeUrl: null }) };
  const { queryByText } = render(<UpdateGate />);
  await act(async () => {});
  await waitFor(() => expect(queryByText(REQUIRED_HEADLINE)).toBeNull());
});

it('renders nothing for an unknown status', async () => {
  mockCheck = {
    data: result({ status: 'something_new' as unknown as AppVersionCheckResult['status'] }),
  };
  const { queryByText, UNSAFE_queryAllByType } = render(<UpdateGate />);
  await act(async () => {});
  expect(queryByText(REQUIRED_HEADLINE)).toBeNull();
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
  expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0);
});

it('keeps one Modal mounted when the sheet turns into the blocker', async () => {
  mockCheck = { data: result({ status: 'update_available', latestVersion: '1.2.0' }) };
  const { findByText, queryByText, rerender, UNSAFE_getAllByType } = render(<UpdateGate />);
  await findByText(AVAILABLE_HEADLINE);
  expect(UNSAFE_getAllByType(Modal)).toHaveLength(1);

  mockCheck = { data: result({ status: 'update_required', latestVersion: '1.2.0' }) };
  rerender(<UpdateGate />);

  expect(await findByText(REQUIRED_HEADLINE)).toBeTruthy();
  expect(queryByText(AVAILABLE_HEADLINE)).toBeNull();
  expect(UNSAFE_getAllByType(Modal)).toHaveLength(1);
});
