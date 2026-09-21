import { act, renderHook, waitFor } from '@testing-library/react-native';

// The hook only needs the two lib/network primitives; mock them directly so
// this test never touches expo-network's shape.
const mockReadIsOffline = jest.fn(async () => false);
let mockEmitOffline: ((isOffline: boolean) => void) | undefined;
const mockUnsubscribe = jest.fn();
jest.mock('@mobile/lib/network', () => ({
  readIsOffline: () => mockReadIsOffline(),
  subscribeIsOffline: (listener: (isOffline: boolean) => void) => {
    mockEmitOffline = listener;
    return mockUnsubscribe;
  },
}));

import { useNetworkStatus } from '@mobile/hooks/useNetworkStatus';

beforeEach(() => {
  jest.clearAllMocks();
  mockReadIsOffline.mockResolvedValue(false);
  mockEmitOffline = undefined;
});

it('starts online and stays online after the first read agrees', async () => {
  const { result } = renderHook(() => useNetworkStatus());

  expect(result.current.isOffline).toBe(false);
  await act(async () => {});
  expect(result.current.isOffline).toBe(false);
});

it('seeds from the first read when the device is already offline', async () => {
  mockReadIsOffline.mockResolvedValue(true);

  const { result } = renderHook(() => useNetworkStatus());

  await waitFor(() => expect(result.current.isOffline).toBe(true));
});

it('follows OS events', async () => {
  const { result } = renderHook(() => useNetworkStatus());
  await act(async () => {});

  act(() => mockEmitOffline?.(true));
  expect(result.current.isOffline).toBe(true);

  act(() => mockEmitOffline?.(false));
  expect(result.current.isOffline).toBe(false);
});

it('recheck applies the fresh read and returns it', async () => {
  const { result } = renderHook(() => useNetworkStatus());
  await act(async () => {});
  act(() => mockEmitOffline?.(true));

  mockReadIsOffline.mockResolvedValue(false);
  let outcome: boolean | undefined;
  await act(async () => {
    outcome = await result.current.recheck();
  });

  expect(outcome).toBe(false);
  expect(result.current.isOffline).toBe(false);
});

it('unsubscribes on unmount', async () => {
  const { unmount } = renderHook(() => useNetworkStatus());
  await act(async () => {});

  unmount();

  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
