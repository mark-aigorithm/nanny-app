import { AppState } from 'react-native';
import { focusManager, onlineManager } from '@tanstack/react-query';

import { bindFocusManager, bindOnlineManager, subscribeAppActive } from '@mobile/lib/queryClient';

afterEach(() => {
  // Leave the singleton the way React Query ships it for other test files.
  onlineManager.setEventListener(() => undefined);
  onlineManager.setOnline(true);
});

it('drives onlineManager from the offline subscription', () => {
  let emit: ((isOffline: boolean) => void) | undefined;
  const unsubscribe = jest.fn();

  bindOnlineManager((listener) => {
    emit = listener;
    return unsubscribe;
  });

  emit?.(true);
  expect(onlineManager.isOnline()).toBe(false);

  emit?.(false);
  expect(onlineManager.isOnline()).toBe(true);
});

it('tears down the previous subscription when the listener is replaced', () => {
  const unsubscribe = jest.fn();
  bindOnlineManager(() => unsubscribe);

  onlineManager.setEventListener(() => undefined);

  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

describe('focus — app foreground', () => {
  afterEach(() => {
    focusManager.setEventListener(() => undefined);
    focusManager.setFocused(undefined);
  });

  it('treats the app coming to the foreground as focus, so stale queries refetch', () => {
    let emit: ((isActive: boolean) => void) | undefined;
    bindFocusManager((listener) => {
      emit = listener;
      return jest.fn();
    });

    emit?.(false);
    expect(focusManager.isFocused()).toBe(false);

    emit?.(true);
    expect(focusManager.isFocused()).toBe(true);
  });

  it('reports AppState changes as active / not active', () => {
    const remove = jest.fn();
    let handler: ((state: string) => void) | undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
      handler = h as (state: string) => void;
      return { remove } as never;
    });
    const listener = jest.fn();

    const unsubscribe = subscribeAppActive(listener);
    handler?.('background');
    handler?.('active');
    unsubscribe();

    expect(listener.mock.calls).toEqual([[false], [true]]);
    expect(remove).toHaveBeenCalled();
    spy.mockRestore();
  });
});
