import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PackageHoursBalance } from '@nanny-app/shared';

// This screen navigates through the imperative `router`, not useRouter().
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

import PackageHoursScreen from '@mobile/screens/parent/PackageHoursScreen';
import { PACKAGE_HOURS_KEY } from '@mobile/hooks/usePackages';

function renderScreen(balance: PackageHoursBalance) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData([PACKAGE_HOURS_KEY], balance);
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageHoursScreen />
    </QueryClientProvider>,
  );
}

const PENDING = {
  id: 41,
  packageId: 3,
  packageName: 'Starter Pack',
  hoursPurchased: 20,
  hoursRemaining: 0,
  maxSkills: 2,
  status: 'PENDING_PAYMENT' as const,
  purchasedAt: null,
  expiresAt: '2026-10-25T00:00:00.000Z',
};

beforeEach(() => mockPush.mockClear());

describe('PackageHoursScreen', () => {
  it('lets a parent who closed the checkout resume paying for the pending package', () => {
    const { getByLabelText, getByText } = renderScreen({ availableHours: 0, buckets: [PENDING] });

    expect(getByText('20h once paid')).toBeTruthy();
    fireEvent.press(getByLabelText('Complete payment for Starter Pack'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '3' },
    });
  });

  it('does not offer payment on an active package', () => {
    const { queryByText, getByText } = renderScreen({
      availableHours: 12,
      buckets: [{ ...PENDING, status: 'ACTIVE', hoursRemaining: 12, purchasedAt: '2026-09-25T00:00:00.000Z' }],
    });

    expect(getByText('12h of 20h left')).toBeTruthy();
    expect(queryByText('Complete payment')).toBeNull();
  });
});
