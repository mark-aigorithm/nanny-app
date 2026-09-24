import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn(), dismissTo: mockDismissTo }),
}));

type Opts<T> = { onSuccess?: (v: T) => void; onError?: (e: { message: string }) => void };
const mockSendOtp = jest.fn((_v: unknown, o: Opts<unknown>) => o.onSuccess?.({ confirm: jest.fn() }));
const mockSendLinkCode = jest.fn((_v: unknown, o: Opts<unknown>) =>
  o.onSuccess?.({ verificationId: 'vid', autoVerified: false, code: null }),
);
const mockConfirmPhone = jest.fn().mockResolvedValue(undefined);
const mockLinkPhone = jest.fn().mockResolvedValue(undefined);
const mockRegister = jest.fn().mockResolvedValue({ id: 1 });
jest.mock('@mobile/hooks/useAuth', () => ({
  useSendPhoneOtp: () => ({ mutate: mockSendOtp, isPending: false }),
  useSendPhoneLinkCode: () => ({ mutate: mockSendLinkCode, isPending: false }),
  useConfirmPhoneAndLink: () => ({ mutateAsync: mockConfirmPhone, isPending: false }),
  useLinkPhoneToCurrentUser: () => ({ mutateAsync: mockLinkPhone, isPending: false }),
  useRegisterProfile: () => ({ mutateAsync: mockRegister, isPending: false }),
}));
jest.mock('@mobile/hooks/useReferrals', () => ({
  useRedeemReferralCode: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@mobile/components/ReferralCodeField', () => () => null);
jest.mock('@mobile/lib/storage', () => ({ uploadImageToFirebase: jest.fn() }));
const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));

import RegistrationStep3Screen from '@mobile/screens/auth/RegistrationStep3Screen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

function seedMotherDraft(extra: Record<string, unknown>) {
  useRegistrationDraftStore.setState({
    role: 'parent',
    firstName: 'Mona',
    lastName: 'Adel',
    email: 'mona@gmail.com',
    countryCode: '+20',
    phone: '1234567891',
    dob: '05/10/1990',
    latitude: 30.04,
    longitude: 31.23,
    ...extra,
  });
}

function renderScreen() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationStep3Screen />
    </QueryClientProvider>,
  );
}

function completeSetup() {
  fireEvent.changeText(screen.getByTestId('registerStep3.code'), '111111');
  fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
  fireEvent.press(screen.getByText('Complete setup'));
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
});

it('phone wizard: confirms, links the password, and registers with the email token', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  renderScreen();
  expect(mockSendOtp).toHaveBeenCalledTimes(1);

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockConfirmPhone).toHaveBeenCalledWith(
    expect.objectContaining({ code: '111111', email: 'mona@gmail.com', password: 'Passw0rd!' }),
  );
  expect(mockRegister.mock.calls[0][0]).toMatchObject({ emailVerificationToken: 'tok', phone: '+201234567891' });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/notification-permission', params: { role: 'parent' } });
});

it('Google wizard: links the phone onto the signed-in account and registers without a token', async () => {
  seedMotherDraft({ authProvider: 'google', socialUid: 'uid-social' });
  renderScreen();
  expect(mockSendLinkCode).toHaveBeenCalledWith({ phone: '+201234567891', forceResend: false }, expect.anything());
  expect(mockSendOtp).not.toHaveBeenCalled();

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockLinkPhone).toHaveBeenCalledWith({
    challenge: { verificationId: 'vid', autoVerified: false, code: null },
    code: '111111',
    phone: '+201234567891',
    // So the hook can refuse any account but the one this sign-up created.
    socialUid: 'uid-social',
  });
  expect(mockRegister.mock.calls[0][0]).not.toHaveProperty('emailVerificationToken');
});

it('Google wizard: a number that already has an account starts the collision flow', async () => {
  seedMotherDraft({ authProvider: 'google', socialUid: 'uid-social' });
  mockLinkPhone.mockRejectedValueOnce({
    field: 'phone',
    message: 'This phone number already has an account.',
    code: 'auth/credential-already-in-use',
  });
  renderScreen();

  completeSetup();

  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockAbandon).toHaveBeenCalledWith('+201234567891');
  expect(mockRegister).not.toHaveBeenCalled();
});

it('Google wizard: keeps Complete setup disabled while the collision hand-off runs', async () => {
  seedMotherDraft({ authProvider: 'google', socialUid: 'uid-social' });
  mockLinkPhone.mockRejectedValueOnce({
    field: 'phone',
    message: 'This phone number already has an account.',
    code: 'auth/credential-already-in-use',
  });
  let finishHandOff: () => void = () => undefined;
  mockAbandon.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishHandOff = resolve;
      }),
  );
  renderScreen();

  completeSetup();
  await waitFor(() => expect(mockAbandon).toHaveBeenCalledTimes(1));
  // A second tap while the throwaway account is being deleted must not run
  // the link again against a signed-out user.
  fireEvent.press(screen.getByText('Complete setup'));
  expect(mockLinkPhone).toHaveBeenCalledTimes(1);

  finishHandOff();
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockAbandon).toHaveBeenCalledTimes(1);
});

describe('Google wizard on an Android instant verification', () => {
  const INSTANT = { verificationId: null, autoVerified: true, code: null };
  const RESEND_MESSAGE = "We couldn't confirm your number. Tap Resend code to get a code by SMS.";

  beforeEach(() => {
    mockSendLinkCode.mockImplementationOnce((_v: unknown, o: Opts<unknown>) => o.onSuccess?.(INSTANT));
  });

  it('completes setup without a code to type', async () => {
    seedMotherDraft({ authProvider: 'google', socialUid: 'uid-social' });
    renderScreen();

    expect(screen.getByText('Your number was verified automatically.')).toBeTruthy();
    expect(screen.queryByTestId('registerStep3.code')).toBeNull();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockLinkPhone).toHaveBeenCalledWith({ challenge: INSTANT, code: '', phone: '+201234567891', socialUid: 'uid-social' });
  });

  it('drops the spent verification after a failed link and points her at resend', async () => {
    seedMotherDraft({ authProvider: 'google', socialUid: 'uid-social' });
    mockLinkPhone.mockRejectedValueOnce({ field: 'form', message: 'Something went wrong. Please try again.' });
    renderScreen();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(screen.getByText(RESEND_MESSAGE)).toBeTruthy());
    expect(mockRegister).not.toHaveBeenCalled();
    // Back to typing a code, and resend is available straight away.
    expect(screen.getByTestId('registerStep3.code')).toBeTruthy();
    fireEvent.press(screen.getByText('Resend code'));
    expect(mockSendLinkCode).toHaveBeenLastCalledWith({ phone: '+201234567891', forceResend: true }, expect.anything());
  });
});
