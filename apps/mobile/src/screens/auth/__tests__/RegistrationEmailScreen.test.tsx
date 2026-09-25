import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
let mockRole = 'parent';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ role: mockRole }),
}));

import { api } from '@mobile/lib/api';
import RegistrationEmailScreen from '@mobile/screens/auth/RegistrationEmailScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const mockPost = api.post as jest.Mock;

async function renderAndVerify() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const screen = render(
    <QueryClientProvider client={queryClient}>
      <RegistrationEmailScreen />
    </QueryClientProvider>,
  );
  // The code is sent on arrival; let that settle.
  await act(async () => {});
  fireEvent.changeText(screen.getByTestId('registerEmail.code'), '123456');
  fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'parent';
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ email: 'Mona@Example.com' });
  mockPost.mockImplementation(async (url: string) =>
    url === '/auth/email/verify'
      ? { data: { data: { verificationToken: 'tok-1' }, error: null } }
      : { data: { data: null, error: null } },
  );
});

it('goes on to create a password after the code', async () => {
  await renderAndVerify();

  expect(useRegistrationDraftStore.getState().emailVerificationToken).toBe('tok-1');
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-create-password', params: { role: 'parent' } });
});

it('skips create-password when the resumed account already has a password and phone for this email', async () => {
  useRegistrationDraftStore.setState({ passwordEmail: 'mona@example.com', accountPhone: '+201234567890' });
  await renderAndVerify();

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-2', params: { role: 'parent' } });
});

it('sends a nanny with an existing password and phone straight to her location', async () => {
  mockRole = 'nanny';
  useRegistrationDraftStore.setState({ passwordEmail: 'mona@example.com', accountPhone: '+201234567890' });
  await renderAndVerify();

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-nanny-location', params: { role: 'nanny' } });
});

it('still asks for a password when the existing one belongs to a different email', async () => {
  useRegistrationDraftStore.setState({ passwordEmail: 'someone.else@example.com', accountPhone: '+201234567890' });
  await renderAndVerify();

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-create-password', params: { role: 'parent' } });
});

it('still asks for a password when the matching password has no phone on the account', async () => {
  // A leftover with a password but no phone would otherwise confirm the SMS
  // step into a different uid (the phone door signs in fresh) and dead-end on
  // "Please go back and create a password", with Back only skipping the step
  // again — so the skip requires a phone on the account too.
  useRegistrationDraftStore.setState({ passwordEmail: 'mona@example.com' });
  await renderAndVerify();

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-create-password', params: { role: 'parent' } });
});
