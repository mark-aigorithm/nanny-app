import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import type { UserResponse } from '@nanny-app/shared';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

import { useNannyAccessGuard } from '@mobile/hooks/useNannyAccessGuard';
import { useUserProfileStore } from '@mobile/store/userProfileStore';

function nanny(approvalStatus: string): UserResponse {
  return { role: 'NANNY', approvalStatus } as unknown as UserResponse;
}

function setup() {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  renderHook(() => useNannyAccessGuard(), { wrapper });
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  useUserProfileStore.getState().setProfile(nanny('APPROVED'));
});

describe('useNannyAccessGuard', () => {
  it('leaves an approved nanny where she is', () => {
    setup();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends her to Upload ID as soon as her ID is sent back', () => {
    setup();
    act(() => useUserProfileStore.getState().setProfile(nanny('PENDING_ID')));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/upload-id');
  });

  it('does nothing while signed out', () => {
    useUserProfileStore.getState().setProfile(null);
    setup();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('re-checks her status when the app returns to the foreground', () => {
    const listeners: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, cb) => {
      listeners.push(cb as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { invalidate } = setup();

    act(() => listeners.forEach((cb) => cb('active')));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['auth', 'me'] });
  });
});
