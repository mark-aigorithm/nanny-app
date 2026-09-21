import * as Network from 'expo-network';

import { isOfflineState, readIsOffline, subscribeIsOffline } from '@mobile/lib/network';

// jest.setup.js already replaces expo-network with jest.fn()s; type them so
// each test can steer one call without re-declaring the whole module.
const mockedNetwork = jest.mocked(Network);

afterEach(() => {
  jest.clearAllMocks();
});

describe('isOfflineState', () => {
  it('is offline when the OS says there is no connection', () => {
    expect(isOfflineState({ isConnected: false, isInternetReachable: true })).toBe(true);
  });

  it('is offline when connected to a network that cannot reach the internet', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: false })).toBe(true);
  });

  it('is online when both flags are true', () => {
    expect(isOfflineState({ isConnected: true, isInternetReachable: true })).toBe(false);
  });

  it('treats an unknown state as online so the overlay never flashes on cold start', () => {
    expect(isOfflineState({})).toBe(false);
    expect(isOfflineState({ isConnected: true, isInternetReachable: undefined })).toBe(false);
  });
});

describe('readIsOffline', () => {
  it('maps the current OS state', async () => {
    mockedNetwork.getNetworkStateAsync.mockResolvedValueOnce({ isConnected: false });

    await expect(readIsOffline()).resolves.toBe(true);
  });

  it('treats a failed read as online', async () => {
    mockedNetwork.getNetworkStateAsync.mockRejectedValueOnce(new Error('no native module'));

    await expect(readIsOffline()).resolves.toBe(false);
  });
});

describe('subscribeIsOffline', () => {
  it('forwards every OS event as a boolean and removes the subscription on unsubscribe', () => {
    const remove = jest.fn();
    let emit: ((state: Network.NetworkState) => void) | undefined;
    mockedNetwork.addNetworkStateListener.mockImplementationOnce((listener) => {
      emit = listener;
      return { remove };
    });
    const listener = jest.fn();

    const unsubscribe = subscribeIsOffline(listener);
    emit?.({ isConnected: false });
    emit?.({ isConnected: true, isInternetReachable: true });

    expect(listener.mock.calls).toEqual([[true], [false]]);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
