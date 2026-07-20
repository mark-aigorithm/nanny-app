import React from 'react';
import { Linking } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SupportContact } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase, which eagerly initializes the real SDK
// at module-load time and crashes jest-expo's transform. Stub the API layer;
// `unwrap` keeps its real envelope-unwrapping shape.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import { api } from '@mobile/lib/api';
import CustomerSupportScreen from '@mobile/screens/parent/CustomerSupportScreen';

const mockGet = api.get as jest.Mock;

function mockContact(contact: SupportContact) {
  mockGet.mockResolvedValue({ data: { data: contact, error: null } });
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerSupportScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

describe('CustomerSupportScreen contact channels', () => {
  it('opens a wa.me link for the configured WhatsApp number', async () => {
    mockContact({ whatsappNumber: '+201001234567', phoneNumber: '', email: '' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('WhatsApp')).toBeTruthy());
    fireEvent.press(getByText('WhatsApp'));

    expect(Linking.openURL).toHaveBeenCalledWith('https://wa.me/201001234567');
  });

  it('dials the configured support number', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '+201009999999', email: '' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Call support')).toBeTruthy());
    fireEvent.press(getByText('Call support'));

    expect(Linking.openURL).toHaveBeenCalledWith('tel:+201009999999');
  });

  it('opens a mailto link for the configured support email', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '', email: 'support@nannynow.com' });
    const { getByText } = renderScreen();

    await waitFor(() => expect(getByText('Email support')).toBeTruthy());
    fireEvent.press(getByText('Email support'));

    expect(Linking.openURL).toHaveBeenCalledWith('mailto:support@nannynow.com');
  });

  it('hides a channel the admin has not configured', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '+201009999999', email: '' });
    const { queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Call support')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
    expect(queryByText('Email support')).toBeNull();
  });

  it('shows only the community card when nothing is configured', async () => {
    mockContact({ whatsappNumber: '', phoneNumber: '', email: '' });
    const { queryByText, getByText } = renderScreen();

    await waitFor(() => expect(getByText('Ask the community')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
    expect(queryByText('Call support')).toBeNull();
    expect(queryByText('Email support')).toBeNull();
  });

  it('keeps the community card when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    const { getByText, queryByText } = renderScreen();

    await waitFor(() => expect(getByText('Ask the community')).toBeTruthy());
    expect(queryByText('WhatsApp')).toBeNull();
  });
});
