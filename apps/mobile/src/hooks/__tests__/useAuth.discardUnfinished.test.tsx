import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockClearLocalSession = jest.fn();
jest.mock('@mobile/lib/session', () => ({
  clearLocalSession: (...args: unknown[]) => mockClearLocalSession(...args),
}));

import { api } from '@mobile/lib/api';
import { useDiscardUnfinishedAccount } from '@mobile/hooks/useAuth';

const mockDelete = api.delete as jest.Mock;

let currentUnmount: (() => void) | null = null;
function renderDiscard() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useDiscardUnfinishedAccount(), { wrapper: Wrapper });
  currentUnmount = rendered.unmount;
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ data: { data: { deleted: true }, error: null } });
  mockClearLocalSession.mockResolvedValue(undefined);
});

afterEach(() => {
  currentUnmount?.();
  currentUnmount = null;
});

describe('useDiscardUnfinishedAccount', () => {
  it('asks the server to delete the account, then signs out locally', async () => {
    const { result } = renderDiscard();

    await result.current.mutateAsync();

    expect(mockDelete).toHaveBeenCalledWith('/auth/me');
    expect(mockClearLocalSession).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockClearLocalSession.mock.invocationCallOrder[0] as number,
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('still signs out when the server refuses or cannot be reached', async () => {
    mockDelete.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: {} } });
    const { result } = renderDiscard();

    await result.current.mutateAsync();

    expect(mockClearLocalSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('never fails, even when the local sign-out throws', async () => {
    mockClearLocalSession.mockRejectedValue({ code: 'auth/network-request-failed' });
    const { result } = renderDiscard();

    await expect(result.current.mutateAsync()).resolves.toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
