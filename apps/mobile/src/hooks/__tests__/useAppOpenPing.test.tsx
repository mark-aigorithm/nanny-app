import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { api } from '@mobile/lib/api';
import {
  APP_OPEN_PING_INTERVAL_MS,
  resetAppOpenPing,
  useAppOpenPing,
} from '@mobile/hooks/useAppOpenPing';
import { useAuthStore } from '@mobile/store/authStore';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

// The global jest.setup.js stubs `api` with resolving jest.fns; this file only
// counts the calls to the ping route.
const mockPost = api.post as jest.Mock;
const pings = () => mockPost.mock.calls.filter(([url]) => url === '/me/app-open').length;

const START = new Date('2026-10-20T10:00:00.000Z').getTime();
let emitAppState: ((state: string) => void) | undefined;
let appStateSpy: jest.SpyInstance;

function signIn(uid = 'mother-1') {
  useAuthStore.setState({ user: { uid } as never });
  useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
  mockPost.mockClear();
  resetAppOpenPing();
  useAuthStore.setState({ user: null });
  useUserProfileStore.setState({ profile: null });
  emitAppState = undefined;
  appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    emitAppState = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
});

afterEach(() => {
  appStateSpy.mockRestore();
  jest.useRealTimers();
});

describe('useAppOpenPing', () => {
  it('pings once on a cold start when she is signed in with a profile', () => {
    signIn();
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(1);
    expect(mockPost).toHaveBeenCalledWith('/me/app-open');
  });

  it('never pings for a guest', () => {
    renderHook(() => useAppOpenPing());
    act(() => emitAppState?.('active'));
    expect(pings()).toBe(0);
  });

  it('waits for the profile before the first ping', () => {
    useAuthStore.setState({ user: { uid: 'mother-1' } as never });
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(0);

    act(() => useUserProfileStore.setState({ profile: { id: 1, role: 'MOTHER' } as never }));
    expect(pings()).toBe(1);
  });

  it('pings on a return to the foreground only once five minutes have passed', () => {
    signIn();
    renderHook(() => useAppOpenPing());
    expect(pings()).toBe(1);

    act(() => {
      jest.setSystemTime(START + APP_OPEN_PING_INTERVAL_MS - 1000);
      emitAppState?.('active');
    });
    expect(pings()).toBe(1);

    act(() => {
      jest.setSystemTime(START + APP_OPEN_PING_INTERVAL_MS + 1000);
      emitAppState?.('background');
    });
    expect(pings()).toBe(1);

    act(() => emitAppState?.('active'));
    expect(pings()).toBe(2);
  });

  it('pings straight away for a different account', () => {
    signIn('mother-1');
    renderHook(() => useAppOpenPing());
    act(() => signIn('mother-2'));
    expect(pings()).toBe(2);
  });

  it('ignores a failed ping', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    signIn();
    renderHook(() => useAppOpenPing());
    // Let the rejected promise settle: an unhandled rejection fails the test.
    await act(async () => {
      await Promise.resolve();
    });
    expect(pings()).toBe(1);
  });
});
