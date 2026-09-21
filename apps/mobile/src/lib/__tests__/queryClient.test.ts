import { onlineManager } from '@tanstack/react-query';

import { bindOnlineManager } from '@mobile/lib/queryClient';

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
