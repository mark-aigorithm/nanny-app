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
const mockSignOut = jest.fn((_v: unknown, o?: { onSettled?: () => void }) => o?.onSettled?.());
jest.mock('@mobile/hooks/useAuth', () => ({
  useSignOut: () => ({ mutate: mockSignOut, isPending: false }),
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
const mockUpload = jest.fn();
jest.mock('@mobile/lib/storage', () => ({
  uploadImageToFirebase: (...args: unknown[]) => mockUpload(...args),
}));
const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));

let mockCurrentUser: { uid: string } | null = null;
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

import { ApiRequestError } from '@mobile/lib/api';
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
    photoUri: 'file:///photo.jpg',
    address: '1 Test Street, Cairo',
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
  mockCurrentUser = { uid: 'uid-social' };
  useRegistrationDraftStore.getState().reset();
  mockUpload.mockImplementation(async (_uri: string, folder: string) => `https://storage.test/${folder}/uid/photo.jpg`);
});

it('phone wizard: confirms, links the password, and registers with the email token', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  renderScreen();
  expect(mockSendOtp).toHaveBeenCalledTimes(1);

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockConfirmPhone).toHaveBeenCalledWith(
    expect.objectContaining({
      code: '111111',
      email: 'mona@gmail.com',
      password: 'Passw0rd!',
      phone: '+201234567891',
      // So a taken email can be reclaimed with the proof from step 2.
      emailVerificationToken: 'tok',
    }),
  );
  expect(mockRegister.mock.calls[0][0]).toMatchObject({ emailVerificationToken: 'tok', phone: '+201234567891' });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/notification-permission', params: { role: 'parent' } });
});

it('Google wizard: links the phone onto the signed-in account and registers without a token', async () => {
  seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
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
    signUpUid: 'uid-social',
  });
  expect(mockRegister.mock.calls[0][0]).not.toHaveProperty('emailVerificationToken');
});

it('Google wizard: a number that already has an account starts the collision flow', async () => {
  seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
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
  seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
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
    seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
    renderScreen();

    expect(screen.getByText('Your number was verified automatically.')).toBeTruthy();
    expect(screen.queryByTestId('registerStep3.code')).toBeNull();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockLinkPhone).toHaveBeenCalledWith({ challenge: INSTANT, code: '', phone: '+201234567891', signUpUid: 'uid-social' });
  });

  it('drops the spent verification after a failed link and points her at resend', async () => {
    seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
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

it('uploads a mother’s photo and registers it, with the current terms version', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  renderScreen();

  completeSetup();

  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  expect(mockUpload).toHaveBeenCalledWith('file:///photo.jpg', 'avatars');
  expect(mockRegister.mock.calls[0][0]).toMatchObject({
    avatarUrl: 'https://storage.test/avatars/uid/photo.jpg',
    address: '1 Test Street, Cairo',
    termsAcceptedVersion: 'v1.0',
  });
});

it('says the photos failed to upload, and registers nothing, when an upload throws', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  mockUpload.mockRejectedValueOnce(new Error('storage/retry-limit-exceeded'));
  renderScreen();

  completeSetup();

  await waitFor(() =>
    expect(
      screen.getByText("Couldn't upload your photos. Check your connection and try again."),
    ).toBeTruthy(),
  );
  expect(mockRegister).not.toHaveBeenCalled();
});

describe('a resumed sign-up whose account already holds the number', () => {
  const LOCKED = "Your number is already verified.";

  it('phone wizard: sends no code and completes setup with confirmation: null', async () => {
    seedMotherDraft({
      authProvider: 'phone',
      emailVerificationToken: 'tok',
      password: '',
      accountPhone: '+201234567891',
      signUpUid: 'uid-social',
      isResume: true,
    });
    renderScreen();

    expect(mockSendOtp).not.toHaveBeenCalled();
    expect(screen.getByText(LOCKED)).toBeTruthy();
    expect(screen.queryByTestId('registerStep3.code')).toBeNull();
    expect(screen.queryByText('Resend code')).toBeNull();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockConfirmPhone).toHaveBeenCalledWith({
      confirmation: null,
      code: '',
      phone: '+201234567891',
      email: 'mona@gmail.com',
      password: '',
      emailVerificationToken: 'tok',
    });
  });

  it('Google wizard: sends no code and completes setup with challenge: null', async () => {
    seedMotherDraft({ authProvider: 'google', accountPhone: '+201234567891', signUpUid: 'uid-social', isResume: true });
    renderScreen();

    expect(mockSendLinkCode).not.toHaveBeenCalled();
    expect(screen.getByText(LOCKED)).toBeTruthy();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockLinkPhone).toHaveBeenCalledWith({ challenge: null, code: '', phone: '+201234567891', signUpUid: 'uid-social' });
  });

  it('sends a code as usual when the number was changed from the one on the account', () => {
    seedMotherDraft({ authProvider: 'google', accountPhone: '+201111111111', signUpUid: 'uid-social', isResume: true });
    renderScreen();

    expect(mockSendLinkCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(LOCKED)).toBeNull();
    expect(screen.getByTestId('registerStep3.code')).toBeTruthy();
  });

  it('sends a code as usual when someone else is signed in', () => {
    mockCurrentUser = { uid: 'uid-someone-else' };
    seedMotherDraft({ authProvider: 'google', accountPhone: '+201234567891', signUpUid: 'uid-social', isResume: true });
    renderScreen();

    expect(mockSendLinkCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(LOCKED)).toBeNull();
  });
});

describe('a session that no longer matches the sign-up', () => {
  const MISMATCH = { field: 'form', message: 'Your session ended. Please start again.', code: 'session-mismatch' };

  it('says so, offers Start again, and signs out back to sign-in', async () => {
    seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
    mockLinkPhone.mockRejectedValueOnce(MISMATCH);
    renderScreen();

    completeSetup();

    await waitFor(() => expect(screen.getByText(MISMATCH.message)).toBeTruthy());
    expect(mockAbandon).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Start again'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('is handled before the instant-verification fallback', async () => {
    mockSendLinkCode.mockImplementationOnce((_v: unknown, o: Opts<unknown>) =>
      o.onSuccess?.({ verificationId: null, autoVerified: true, code: null }),
    );
    seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
    mockLinkPhone.mockRejectedValueOnce(MISMATCH);
    renderScreen();

    fireEvent.press(screen.getByText('I agree to Terms of Service and Privacy Policy'));
    fireEvent.press(screen.getByText('Complete setup'));

    await waitFor(() => expect(screen.getByText(MISMATCH.message)).toBeTruthy());
    expect(screen.getByText('Start again')).toBeTruthy();
  });

  it('phone wizard: offers Start again too', async () => {
    seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
    mockConfirmPhone.mockRejectedValueOnce(MISMATCH);
    renderScreen();

    completeSetup();

    await waitFor(() => expect(screen.getByText('Start again')).toBeTruthy());
  });
});

it('Google wizard: a 409 from register (email or phone taken) starts the collision flow', async () => {
  seedMotherDraft({ authProvider: 'google', signUpUid: 'uid-social' });
  mockRegister.mockRejectedValueOnce(new ApiRequestError('An account with this email already exists.', 409));
  renderScreen();

  completeSetup();

  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
  expect(mockAbandon).toHaveBeenCalledWith('+201234567891');
});

it('phone wizard: a 409 from register is shown, not treated as a collision', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  mockRegister.mockRejectedValueOnce(new ApiRequestError('An account with this email already exists.', 409));
  renderScreen();

  completeSetup();

  await waitFor(() => expect(screen.getByText('An account with this email already exists.')).toBeTruthy());
  expect(mockAbandon).not.toHaveBeenCalled();
});

it('refuses a missing photo before the phone step, so the SMS code is not spent', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!', photoUri: null });
  renderScreen();

  completeSetup();

  expect(await screen.findByText('Your profile photo is missing. Please go back and add it.')).toBeTruthy();
  expect(mockConfirmPhone).not.toHaveBeenCalled();
  expect(mockRegister).not.toHaveBeenCalled();
});

it('ends the attempt with "Start again" when the number turns out to be an existing account', async () => {
  seedMotherDraft({ authProvider: 'phone', emailVerificationToken: 'tok', password: 'Passw0rd!' });
  mockConfirmPhone.mockRejectedValueOnce({
    field: 'form',
    message: 'This number already has an account. Sign in instead.',
    code: 'account-exists',
  });
  renderScreen();

  completeSetup();

  expect(await screen.findByText('This number already has an account. Sign in instead.')).toBeTruthy();
  expect(screen.getByText('Start again')).toBeTruthy();
  expect(mockRegister).not.toHaveBeenCalled();
});
