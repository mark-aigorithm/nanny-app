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
import { useAppVersionCheck } from '@mobile/hooks/useAppVersionCheck';

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
