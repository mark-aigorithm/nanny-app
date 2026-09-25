import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ packageId: '3' }),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { api } from '@mobile/lib/api';
import PackageCheckoutScreen from '@mobile/screens/parent/PackageCheckoutScreen';

const post = api.post as jest.Mock;

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageCheckoutScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  post.mockImplementation(async (url: string) =>
    url === '/packages/3/purchase'
      ? {
          data: {
            data: { paymentId: 100, clientSecret: 'cs', publicKey: 'pk', intentionId: 'i', purchaseId: 41 },
            error: null,
          },
        }
      : { data: { data: { status: 'FAILED' }, error: null } },
  );
});

describe('PackageCheckoutScreen', () => {
  it('cancels the checkout when the parent leaves without paying', async () => {
    const { unmount } = renderScreen();
    await waitFor(() => expect(post).toHaveBeenCalledWith('/packages/3/purchase', { packageId: 3 }));
    // Let the purchase result land in state before leaving.
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    unmount();

    await waitFor(() => expect(post).toHaveBeenCalledWith('/packages/purchases/41/cancel'));
  });

  it('has nothing to cancel when the checkout never opened', async () => {
    post.mockRejectedValueOnce(new Error('offline'));
    const { unmount, findByText } = renderScreen();
    await findByText('Go back');

    unmount();

    expect(post).toHaveBeenCalledTimes(1);
  });
});
