import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Address } from '@nanny-app/shared';

/**
 * The address book screen: every saved address with its default badge, and
 * the three things a mother does to one — edit it, make it the default,
 * delete it (after a confirmation) — plus adding a new one.
 */
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@mobile/components/AddressFormSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, initial, onSubmit }: { visible: boolean; initial?: { label: string }; onSubmit: (input: unknown) => void }) =>
      visible
        ? React.createElement(
            Pressable,
            { onPress: () => onSubmit({ label: initial?.label ?? 'Work', formattedAddress: 'x', latitude: 1, longitude: 2 }) },
            React.createElement(Text, null, initial ? `editing ${initial.label}` : 'adding'),
          )
        : null,
  };
});

import { api } from '@mobile/lib/api';
import AddressesScreen from '@mobile/screens/parent/AddressesScreen';

const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock; patch: jest.Mock; delete: jest.Mock };

function address(over: Partial<Address>): Address {
  return {
    id: 1,
    label: 'Home',
    formattedAddress: '1 Test Street, Cairo',
    governorate: 'Cairo',
    area: 'Maadi',
    street: null,
    building: null,
    floor: null,
    apartment: null,
    landmark: 'Behind the pharmacy',
    latitude: 30.0444,
    longitude: 31.2357,
    isDefault: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const envelope = (data: unknown) => Promise.resolve({ data: { data, error: null } });

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddressesScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockReturnValue(envelope([address({ id: 1 }), address({ id: 2, label: 'Work', isDefault: false, landmark: null })]));
});

describe('AddressesScreen', () => {
  it('lists every address, marking the default, with the landmark she wrote', async () => {
    const { getByText, getAllByText } = renderScreen();

    await waitFor(() => expect(getByText('Home')).toBeTruthy());
    expect(getByText('Work')).toBeTruthy();
    expect(getAllByText('Default')).toHaveLength(1);
    expect(getByText('Behind the pharmacy')).toBeTruthy();
  });

  it('opens the form to add, and to edit the tapped address', async () => {
    const { getByText, getAllByText } = renderScreen();
    await waitFor(() => expect(getByText('Work')).toBeTruthy());

    fireEvent.press(getByText('Add address'));
    expect(getByText('adding')).toBeTruthy();

    fireEvent.press(getAllByText('Edit')[1]!);
    expect(getByText('editing Work')).toBeTruthy();
  });

  it('makes an address the default', async () => {
    mockApi.post.mockReturnValue(envelope([address({ id: 2, label: 'Work' }), address({ id: 1, isDefault: false })]));
    const { getByText, getAllByText } = renderScreen();
    await waitFor(() => expect(getByText('Work')).toBeTruthy());

    fireEvent.press(getByText('Make default'));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/addresses/2/default'));
    await waitFor(() => expect(getAllByText('Default')).toHaveLength(1));
  });

  it('asks before deleting, then removes the address', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const destructive = buttons?.find((b) => b.style === 'destructive');
      destructive?.onPress?.();
    });
    mockApi.delete.mockReturnValue(envelope([address({ id: 1 })]));
    const { getByText, getAllByText, queryByText } = renderScreen();
    await waitFor(() => expect(getByText('Work')).toBeTruthy());

    fireEvent.press(getAllByText('Delete')[1]!);

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/addresses/2'));
    await waitFor(() => expect(queryByText('Work')).toBeNull());
    alertSpy.mockRestore();
  });

  it('shows an empty state when she has no address yet', async () => {
    mockApi.get.mockReturnValue(envelope([]));
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('No addresses yet')).toBeTruthy());
  });
});
