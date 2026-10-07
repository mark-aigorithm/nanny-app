import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { api } from '@mobile/lib/api';
import {
  useCancelBooking,
  useConfirmFreeBooking,
  useCreateBooking,
  useEndBooking,
  useRedeemBookingPoints,
  useRefundBookingPoints,
} from '@mobile/hooks/useBookings';

const mockPost = api.post as jest.Mock;

/**
 * A booking spends, returns or earns Care Points and package hours on the
 * server. The Account tab's wallet stays mounted, so unless these mutations
 * mark the wallet stale it keeps showing the old balances until the app
 * restarts — the reported "nothing was deducted" bug.
 */
function setup<T>(useHook: () => T) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(useHook, { wrapper });
  const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  return { result, invalidatedKeys };
}

const BOOKING = { data: { data: { id: 9 }, error: null } };

beforeEach(() => mockPost.mockReset());

describe('wallet refresh after a booking moves credits', () => {
  it('refreshes points and package hours once a request is created', async () => {
    mockPost.mockResolvedValueOnce(BOOKING);
    const { result, invalidatedKeys } = setup(() => useCreateBooking());

    result.current.mutate({} as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([['rewards'], ['package-hours'], ['bookings']]),
    );
  });

  it('refreshes them when a booking is cancelled (unpaid credits come back)', async () => {
    mockPost.mockResolvedValueOnce({ data: { data: { booking: { id: 9 }, refundAmount: 0 }, error: null } });
    const { result, invalidatedKeys } = setup(() => useCancelBooking());

    result.current.mutate({ id: 9, reason: 'Plans changed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([['rewards'], ['package-hours']]));
  });

  it.each([
    ['applying points', () => useRedeemBookingPoints(), { id: 9, hours: 1 }],
    ['removing points', () => useRefundBookingPoints(), 9],
    ['confirming a covered booking', () => useConfirmFreeBooking(), 9],
    ['ending a shift (points are earned)', () => useEndBooking(), 9],
  ] as const)('refreshes them after %s', async (_label, useHook, variables) => {
    mockPost.mockResolvedValueOnce(BOOKING);
    const { result, invalidatedKeys } = setup(useHook as () => { mutate: (v: unknown) => void; isSuccess: boolean });

    result.current.mutate(variables);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([['rewards'], ['package-hours']]));
  });
});
