import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: '52', retry: '1', nannyName: 'Nour Hassan' }),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { api } from '@mobile/lib/api';
import BookingStep3Screen from '@mobile/screens/parent/BookingStep3Screen';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const envelope = (data: unknown) => ({ data: { data, error: null } });

/** The header title reads "Confirm booking" too — the button is the last match. */
function confirmButton(getAllByText: (text: string) => unknown[]) {
  const matches = getAllByText('Confirm booking');
  return matches[matches.length - 1] as Parameters<typeof fireEvent.press>[0];
}

function booking(over: Record<string, unknown> = {}) {
  return {
    id: 52,
    status: 'APPROVED',
    totalAmount: 0,
    discountAmount: 318,
    rewardCreditAmount: 318,
    packageCreditAmount: 0,
    nanny: { firstName: 'Nour', lastName: 'Hassan', avatarUrl: null },
    ...over,
  };
}

function renderScreen(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={queryClient}>
      <BookingStep3Screen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BookingStep3Screen — nothing to pay', () => {
  it('never opens a checkout; the mother confirms and lands on the confirmation', async () => {
    get.mockResolvedValue(envelope(booking()));
    post.mockResolvedValue(envelope(booking({ status: 'CONFIRMED' })));

    const { findByText, getByText, getAllByText } = renderScreen();

    expect(await findByText('Nothing to pay')).toBeTruthy();
    expect(getByText(/Your Care Points cover this booking in full\./)).toBeTruthy();
    expect(post).not.toHaveBeenCalledWith('/bookings/52/pay/paymob', expect.anything());

    fireEvent.press(confirmButton(getAllByText));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/bookings/52/confirm-free'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(parent)/book/booking-confirmation',
        params: { bookingId: '52' },
      }),
    );
  });

  it('shows why a confirm failed and stays put', async () => {
    get.mockResolvedValue(envelope(booking()));
    post.mockRejectedValue(new Error('This booking is already paid.'));

    const { findByText, getAllByText } = renderScreen();
    await findByText('Nothing to pay');

    fireEvent.press(confirmButton(getAllByText));

    expect(await findByText('This booking is already paid.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('opens the checkout when something is owed', async () => {
    get.mockResolvedValue(envelope(booking({ totalAmount: 318, discountAmount: 0, rewardCreditAmount: 0 })));
    post.mockResolvedValue(
      envelope({ paymentId: 8, clientSecret: 'cs', publicKey: 'pk', intentionId: 'i' }),
    );

    const { queryByText } = renderScreen();

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/bookings/52/pay/paymob', { method: 'CARD' }),
    );
    expect(queryByText('Nothing to pay')).toBeNull();
  });

  it('reads the total afresh even when the cached booking is still fresh', async () => {
    // The app caches for a minute; the booking screen she came from just loaded
    // it — before her Care Points brought the total to zero.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    queryClient.setQueryData(['bookings', 52], booking({ totalAmount: 318, discountAmount: 0, rewardCreditAmount: 0 }));
    get.mockResolvedValue(envelope(booking()));

    const { findByText } = renderScreen(queryClient);

    expect(await findByText('Nothing to pay')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/bookings/52');
    expect(post).not.toHaveBeenCalledWith('/bookings/52/pay/paymob', expect.anything());
  });
});
