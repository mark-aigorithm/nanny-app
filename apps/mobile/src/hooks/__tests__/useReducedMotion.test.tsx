import { AccessibilityInfo } from 'react-native';
import { renderHook, waitFor, act } from '@testing-library/react-native';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

type ReduceMotionListener = (enabled: boolean) => void;

let listener: ReduceMotionListener | undefined;
const remove = jest.fn();

beforeEach(() => {
  listener = undefined;
  remove.mockClear();
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    _event: string,
    handler: ReduceMotionListener,
  ) => {
    listener = handler;
    return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useReducedMotion', () => {
  it('reports the OS setting once it has been read', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('follows the setting when it changes', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(listener).toBeDefined());
    act(() => listener?.(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { unmount } = renderHook(() => useReducedMotion());
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
