import React, { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Address } from '@nanny-app/shared';

/**
 * The "Where" step: a picker over the mother's saved addresses. The default
 * is preselected the moment the list arrives, any card can be chosen, and
 * "Add new" opens the form and selects what it creates.
 */
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

jest.mock('@mobile/components/AddressFormSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onSubmit }: { visible: boolean; onSubmit: (input: unknown) => void }) =>
      visible
        ? React.createElement(
            Pressable,
            { onPress: () => onSubmit({ label: 'Work', formattedAddress: 'Smart Village', latitude: 30.07, longitude: 31.01 }) },
            React.createElement(Text, null, 'submit stub'),
          )
        : null,
  };
});

import { api } from '@mobile/lib/api';
import BookingLocationSection from '@mobile/components/BookingLocationSection';

const mockApi = api as unknown as { get: jest.Mock; post: jest.Mock };

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
    landmark: null,
    latitude: 30.0444,
    longitude: 31.2357,
    isDefault: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

const envelope = (data: unknown) => Promise.resolve({ data: { data, error: null } });

/** Hosts the section the way the date picker does: it owns the selection. */
function Host({ onSelect }: { onSelect?: (id: number | null) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return (
    <BookingLocationSection
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id);
        onSelect?.(id);
      }}
    />
  );
}

function renderHost(onSelect?: (id: number | null) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Host onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('BookingLocationSection', () => {
  it('lists the saved addresses and preselects the default', async () => {
    mockApi.get.mockReturnValue(envelope([address({ id: 1, isDefault: false, label: 'Work' }), address({ id: 2 })]));
    const onSelect = jest.fn();

    const { getByText } = renderHost(onSelect);

    await waitFor(() => expect(getByText('Home')).toBeTruthy());
    expect(getByText('Work')).toBeTruthy();
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(2));
  });

  it('selects whichever card she taps', async () => {
    mockApi.get.mockReturnValue(envelope([address({ id: 1 }), address({ id: 2, isDefault: false, label: 'Work' })]));
    const onSelect = jest.fn();

    const { getByText } = renderHost(onSelect);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(1));

    fireEvent.press(getByText('Work'));

    expect(onSelect).toHaveBeenLastCalledWith(2);
  });

  it('shows the empty prompt when she has no address, and adding one selects it', async () => {
    mockApi.get.mockReturnValue(envelope([]));
    mockApi.post.mockReturnValue(envelope(address({ id: 9, label: 'Work', formattedAddress: 'Smart Village' })));
    const onSelect = jest.fn();

    const { getByText, queryByText } = renderHost(onSelect);

    await waitFor(() => expect(getByText('Add your address')).toBeTruthy());
    expect(queryByText('submit stub')).toBeNull();

    fireEvent.press(getByText('Add your address'));
    fireEvent.press(getByText('submit stub'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(9));
    expect(mockApi.post).toHaveBeenCalledWith('/addresses', expect.objectContaining({ label: 'Work' }));
    await waitFor(() => expect(getByText('Smart Village')).toBeTruthy());
  });

  it('offers "Add new" alongside the saved list', async () => {
    mockApi.get.mockReturnValue(envelope([address({ id: 1 })]));

    const { getByText } = renderHost();

    await waitFor(() => expect(getByText('Add new')).toBeTruthy());
    fireEvent.press(getByText('Add new'));
    expect(getByText('submit stub')).toBeTruthy();
  });
});
