import { renderHook } from '@testing-library/react-native';

let mockFocusEffect: (() => void) | undefined;
jest.mock('expo-router', () => ({
  // Capture the effect so the test can play "the screen gained focus" itself.
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect = effect;
  },
}));

import { useRefetchOnFocus } from '@mobile/hooks/useRefetchOnFocus';

beforeEach(() => {
  mockFocusEffect = undefined;
});

describe('useRefetchOnFocus', () => {
  it('skips the first focus (the screen just mounted and fetched) and refetches on every return', () => {
    const refetch = jest.fn();
    renderHook(() => useRefetchOnFocus([refetch]));

    mockFocusEffect?.(); // mount
    expect(refetch).not.toHaveBeenCalled();

    mockFocusEffect?.(); // came back to the tab
    mockFocusEffect?.();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('refetches every query it is given', () => {
    const a = jest.fn();
    const b = jest.fn();
    renderHook(() => useRefetchOnFocus([a, b]));

    mockFocusEffect?.();
    mockFocusEffect?.();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('does nothing while disabled (a guest has no wallet)', () => {
    const refetch = jest.fn();
    renderHook(() => useRefetchOnFocus([refetch], false));

    mockFocusEffect?.();
    mockFocusEffect?.();

    expect(refetch).not.toHaveBeenCalled();
  });
});
