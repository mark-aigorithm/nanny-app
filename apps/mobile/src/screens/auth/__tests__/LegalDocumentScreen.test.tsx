import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LegalDocument } from '@nanny-app/shared';

// `@mobile/lib/api` imports firebase; stub it, keeping `unwrap`'s real shape.
jest.mock('@mobile/lib/api', () => ({
  api: { get: jest.fn() },
  unwrap: jest.fn((promise: Promise<{ data: { data: unknown; error: string | null } }>) =>
    promise.then((res) => res.data.data),
  ),
}));

let mockParams: { key?: string } = { key: 'terms' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

import { api } from '@mobile/lib/api';
import LegalDocumentScreen from '@mobile/screens/auth/LegalDocumentScreen';

const mockGet = api.get as jest.Mock;

const TERMS: LegalDocument = {
  key: 'terms',
  title: 'Terms of Service',
  body: 'Book and pay through the app.',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LegalDocumentScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { key: 'terms' };
});

it('reads the document the route names, and shows its title, text and date', async () => {
  mockGet.mockResolvedValue({ data: { data: TERMS, error: null } });
  const { findByText, getByText } = renderScreen();

  expect(await findByText('Book and pay through the app.')).toBeTruthy();
  expect(getByText('Terms of Service')).toBeTruthy();
  expect(getByText('Last updated 1 September 2026')).toBeTruthy();
  expect(mockGet).toHaveBeenCalledWith('/legal/terms');
});

it('reads the privacy policy for /legal/privacy', async () => {
  mockParams = { key: 'privacy' };
  mockGet.mockResolvedValue({
    data: { data: { ...TERMS, key: 'privacy', title: 'Privacy Policy' }, error: null },
  });
  renderScreen();
  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/legal/privacy'));
});

it('shows no date for the placeholder an operator has not replaced yet', async () => {
  mockGet.mockResolvedValue({
    data: { data: { ...TERMS, body: 'Our Terms of Service will be published here soon.', updatedAt: null }, error: null },
  });
  const { findByText, queryByText } = renderScreen();
  expect(await findByText(/published here soon/)).toBeTruthy();
  expect(queryByText(/last updated/i)).toBeNull();
});

it('shows a spinner while it loads', () => {
  mockGet.mockReturnValue(new Promise(() => {}));
  const { getByLabelText } = renderScreen();
  expect(getByLabelText('Loading')).toBeTruthy();
});

it('says so when it can’t load, and tries again on tap', async () => {
  mockGet.mockRejectedValueOnce(new Error('offline'));
  const { findByText } = renderScreen();

  const retry = await findByText('Try again');
  mockGet.mockResolvedValue({ data: { data: TERMS, error: null } });
  fireEvent.press(retry);

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  expect(await findByText('Book and pay through the app.')).toBeTruthy();
});
