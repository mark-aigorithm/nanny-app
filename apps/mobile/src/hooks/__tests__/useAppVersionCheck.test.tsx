import React from 'react';
import { Platform } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

import { api } from '@mobile/lib/api';
import { useAppVersionCheck, useIsVersionCheckSettled } from '@mobile/hooks/useAppVersionCheck';

const mockGet = api.get as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const originalOS = Platform.OS;
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: originalOS });
  jest.clearAllMocks();
});

it('asks the backend with the platform and the installed native version', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'android' });
  mockGet.mockResolvedValue({
    data: { data: { status: 'ok', latestVersion: null, storeUrl: null, releaseNotes: null }, error: null },
  });

  const { result } = renderHook(() => useAppVersionCheck(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockGet).toHaveBeenCalledWith('/app-version/check', {
    params: { platform: 'android', version: '1.0.0' },
  });
});

it('never calls the backend on a platform the API does not know (web preview)', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web' });
  renderHook(() => useAppVersionCheck(), { wrapper });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockGet).not.toHaveBeenCalled();
});

describe('useIsVersionCheckSettled', () => {
  it('is false while the check loads, then true once it answers', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    let answer: (v: unknown) => void = () => undefined;
    mockGet.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    const { result } = renderHook(() => useIsVersionCheckSettled(), { wrapper });
    expect(result.current).toBe(false);
    answer({ data: { data: { status: 'ok', latestVersion: null, storeUrl: null, releaseNotes: null }, error: null } });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is true once the check fails (the gate fails open)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockGet.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useIsVersionCheckSettled(), { wrapper });
    // The check retries once (about a second) before it counts as failed.
    await waitFor(() => expect(result.current).toBe(true), { timeout: 3000 });
  });

  it('is true at once where the check never runs', () => {
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    const { result } = renderHook(() => useIsVersionCheckSettled(), { wrapper });
    expect(result.current).toBe(true);
  });
});
