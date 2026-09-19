import React from 'react';
import type { Address } from '@nanny-app/shared';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The address-book hooks: every mutation answers with the server's view of
 * the list (or the one row) and writes it straight into the query cache, so
 * the picker and the Addresses screen never show a stale default.
 */
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

import { api } from '@mobile/lib/api';
import {
  ADDRESSES_KEY,
  defaultAddressOf,
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from '@mobile/hooks/useAddresses';

const mockApi = api as unknown as {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

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

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => jest.clearAllMocks());

describe('useAddresses', () => {
  it('lists the address book from GET /addresses', async () => {
    mockApi.get.mockReturnValue(envelope([address({ id: 1 }), address({ id: 2, isDefault: false })]));
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useAddresses(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(mockApi.get).toHaveBeenCalledWith('/addresses');
  });
});

describe('defaultAddressOf', () => {
  it('picks the default, falling back to the first entry, or null when empty', () => {
    expect(defaultAddressOf([address({ id: 1, isDefault: false }), address({ id: 2 })])?.id).toBe(2);
    expect(defaultAddressOf([address({ id: 3, isDefault: false })])?.id).toBe(3);
    expect(defaultAddressOf([])).toBeNull();
    expect(defaultAddressOf(undefined)).toBeNull();
  });
});

describe('mutations keep the cached list current', () => {
  it('useCreateAddress appends the created row (and demotes the old default when it is the new one)', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData([ADDRESSES_KEY], [address({ id: 1 })]);
    mockApi.post.mockReturnValue(envelope(address({ id: 2, label: 'Work', isDefault: true })));

    const { result } = renderHook(() => useCreateAddress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ label: 'Work', formattedAddress: 'x', latitude: 1, longitude: 2, isDefault: true });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.post).toHaveBeenCalledWith('/addresses', expect.objectContaining({ label: 'Work' }));
    expect(qc.getQueryData<Address[]>([ADDRESSES_KEY])?.map((a) => [a.id, a.isDefault])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it('useUpdateAddress replaces the edited row in place', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData([ADDRESSES_KEY], [address({ id: 1 }), address({ id: 2, isDefault: false })]);
    mockApi.patch.mockReturnValue(envelope(address({ id: 2, isDefault: false, landmark: 'gate 2' })));

    const { result } = renderHook(() => useUpdateAddress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 2, patch: { landmark: 'gate 2' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockApi.patch).toHaveBeenCalledWith('/addresses/2', { landmark: 'gate 2' });
    expect(qc.getQueryData<Address[]>([ADDRESSES_KEY])?.[1]?.landmark).toBe('gate 2');
  });

  it('useSetDefaultAddress and useDeleteAddress take the list the server answers with', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData([ADDRESSES_KEY], [address({ id: 1 }), address({ id: 2, isDefault: false })]);
    mockApi.post.mockReturnValue(envelope([address({ id: 2 }), address({ id: 1, isDefault: false })]));
    mockApi.delete.mockReturnValue(envelope([address({ id: 2 })]));

    const setDefault = renderHook(() => useSetDefaultAddress(), { wrapper });
    await act(async () => {
      await setDefault.result.current.mutateAsync(2);
    });
    await waitFor(() => expect(setDefault.result.current.isSuccess).toBe(true));
    expect(mockApi.post).toHaveBeenCalledWith('/addresses/2/default');
    expect(qc.getQueryData<Address[]>([ADDRESSES_KEY])?.[0]?.id).toBe(2);

    const remove = renderHook(() => useDeleteAddress(), { wrapper });
    await act(async () => {
      await remove.result.current.mutateAsync(1);
    });
    await waitFor(() => expect(remove.result.current.isSuccess).toBe(true));
    expect(mockApi.delete).toHaveBeenCalledWith('/addresses/1');
    expect(qc.getQueryData<Address[]>([ADDRESSES_KEY])).toHaveLength(1);
  });
});
