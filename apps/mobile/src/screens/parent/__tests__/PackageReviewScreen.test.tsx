import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PackageHoursBalance, PackagePurchase, PublicPackage } from '@nanny-app/shared';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { api } from '@mobile/lib/api';
import PackageReviewScreen from '@mobile/screens/parent/PackageReviewScreen';
import { PACKAGES_KEY, PACKAGE_HOURS_KEY } from '@mobile/hooks/usePackages';

const STARTER: PublicPackage = {
  id: 3, name: 'Starter Pack', description: null, hours: 20, price: 3000, validityDays: 30, maxSkills: 2,
};
const FAMILY: PublicPackage = { ...STARTER, id: 4, name: 'Family Pack', hours: 40, price: 5600 };

function pending(pkg: PublicPackage): PackagePurchase {
  return {
    id: 41, packageId: pkg.id, packageName: pkg.name, hoursPurchased: pkg.hours, hoursRemaining: 0,
    maxSkills: pkg.maxSkills, status: 'PENDING_PAYMENT', purchasedAt: null, expiresAt: null,
  };
}

function renderScreen(buckets: PackagePurchase[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  queryClient.setQueryData([PACKAGES_KEY, 'list'], [STARTER, FAMILY]);
  queryClient.setQueryData<PackageHoursBalance>([PACKAGE_HOURS_KEY], { availableHours: 0, buckets });
  queryClient.setQueryData(['pricing-config'], { standardHourlyRate: 400 });
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageReviewScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { packageId: '3' };
});

describe('PackageReviewScreen', () => {
  it('shows the package and what it costs without starting a purchase', () => {
    const { getByText, getAllByText } = renderScreen();

    expect(getByText('Starter Pack')).toBeTruthy();
    expect(getByText('20 hours of care')).toBeTruthy();
    expect(getByText('Valid for 30 days after payment')).toBeTruthy();
    // 20 h × 400 pay-as-you-go = 8,000; the package is 3,000.
    expect(getByText('EGP 8,000.00')).toBeTruthy();
    expect(getByText('EGP 5,000.00')).toBeTruthy();
    expect(getAllByText('EGP 3,000.00').length).toBeGreaterThan(0);

    // A mis-tap on "Buy package" lands here — nothing may have been created.
    expect(api.post).not.toHaveBeenCalled();
  });

  it('goes to checkout only once the parent confirms', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue to payment'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '3' },
    });
  });

  it('offers to resume when this package already has an open checkout', () => {
    const { getByText, queryByText } = renderScreen([pending(STARTER)]);

    expect(getByText('Resume payment')).toBeTruthy();
    expect(queryByText('You have an unfinished checkout')).toBeNull();
  });

  it('holds a different package until the open checkout is finished or cancelled', async () => {
    const { getByText } = renderScreen([pending(FAMILY)]);

    expect(getByText('You have an unfinished checkout')).toBeTruthy();
    fireEvent.press(getByText('Continue to payment'));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(getByText('Continue with Family Pack'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(parent)/packages/checkout',
      params: { packageId: '4' },
    });

    fireEvent.press(getByText('Cancel that checkout'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/packages/purchases/41/cancel'));
  });
});
