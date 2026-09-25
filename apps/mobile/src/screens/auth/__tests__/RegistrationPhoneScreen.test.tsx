import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), dismissTo: mockDismissTo }),
}));

type Opts<T> = { onSuccess?: (v: T) => void; onError?: (e: { field: string; message: string }) => void };
const mockCheck = jest.fn();
const mockSendOtp = jest.fn((_v: unknown, o: Opts<unknown>) => o.onSuccess?.({ confirm: jest.fn() }));
const mockSendLinkCode = jest.fn((_v: unknown, o: Opts<unknown>) =>
  o.onSuccess?.({ verificationId: 'vid', autoVerified: false, code: null }),
);
const mockConfirmPhone = jest.fn();
const mockLinkPhone = jest.fn();
const mockSignOut = jest.fn((_v: unknown, o?: { onSettled?: () => void }) => o?.onSettled?.());
jest.mock('@mobile/hooks/useAuth', () => ({
  useCheckAvailability: () => ({ mutateAsync: mockCheck, isPending: false }),
  useSendPhoneOtp: () => ({ mutate: mockSendOtp, isPending: false }),
  useSendPhoneLinkCode: () => ({ mutate: mockSendLinkCode, isPending: false }),
  useConfirmRegistrationPhone: () => ({ mutateAsync: mockConfirmPhone, isPending: false }),
  useLinkPhoneToCurrentUser: () => ({ mutateAsync: mockLinkPhone, isPending: false }),
  useSignOut: () => ({ mutate: mockSignOut, isPending: false }),
}));
// A one-second countdown, so the resend test can wait it out for real.
jest.mock('@mobile/constants', () => ({ ...jest.requireActual('@mobile/constants'), RESEND_SECONDS: 1 }));
const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));

let mockCurrentUser: { uid: string; providerData: { providerId: string }[] } | null = null;
jest.mock('@mobile/lib/firebase', () => ({
  auth: () => ({
    get currentUser() {
      return mockCurrentUser;
    },
  }),
}));

import RegistrationPhoneScreen from '@mobile/screens/auth/RegistrationPhoneScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

const PHONE = '+201001234567';

function typeNumber() {
  fireEvent.changeText(screen.getByTestId('registerPhone.phone'), '1001234567');
}

async function sendCode() {
  typeNumber();
  fireEvent.press(screen.getByText('Send code'));
  await screen.findByTestId('registerPhone.code');
}

async function verify(code = '111111') {
  fireEvent.changeText(screen.getByTestId('registerPhone.code'), code);
  await act(async () => {
    fireEvent.press(screen.getByText('Verify'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'parent' });
  mockCheck.mockResolvedValue({ emailTaken: false, phoneTaken: false });
  mockConfirmPhone.mockImplementation(async () => {
    useRegistrationDraftStore.setState({ signUpUid: 'uid-new', accountPhone: PHONE });
    return 'fresh';
  });
  mockLinkPhone.mockResolvedValue(undefined);
});

it('labels itself step 1 of the mother’s 5', () => {
  render(<RegistrationPhoneScreen />);
  expect(screen.getByText('STEP 1 OF 5 — YOUR NUMBER')).toBeTruthy();
});

describe('phone wizard', () => {
  it('checks the number with the phone alone, then sends the code', async () => {
    render(<RegistrationPhoneScreen />);
    await sendCode();

    expect(mockCheck).toHaveBeenCalledWith({ phone: PHONE });
    expect(mockSendOtp).toHaveBeenCalledWith({ phone: PHONE, forceResend: false }, expect.anything());
    expect(mockCheck.mock.invocationCallOrder[0]).toBeLessThan(mockSendOtp.mock.invocationCallOrder[0] as number);
  });

  it('a taken number: says so, offers Sign in, and sends no SMS', async () => {
    mockCheck.mockResolvedValue({ emailTaken: false, phoneTaken: true });
    render(<RegistrationPhoneScreen />);
    typeNumber();
    fireEvent.press(screen.getByText('Send code'));

    expect(await screen.findByText('This number already has an account.')).toBeTruthy();
    expect(mockSendOtp).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Sign in'));
    expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('refuses a malformed number under the field, without asking anyone', async () => {
    render(<RegistrationPhoneScreen />);
    fireEvent.changeText(screen.getByTestId('registerPhone.phone'), '12');
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => expect(mockCheck).not.toHaveBeenCalled());
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("fails closed when the check can't be made", async () => {
    mockCheck.mockRejectedValue(new Error('Network Error'));
    render(<RegistrationPhoneScreen />);
    typeNumber();
    fireEvent.press(screen.getByText('Send code'));

    expect(await screen.findByText('Could not check your number. Please try again.')).toBeTruthy();
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('a correct code on a new number goes on to "About you"', async () => {
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    expect(mockConfirmPhone).toHaveBeenCalledWith(
      expect.objectContaining({ code: '111111', phone: PHONE }),
    );
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register-about');
  });

  it('a stalled sign-up on this number is handed to the root gate', async () => {
    mockConfirmPhone.mockResolvedValue('leftover');
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a number that turns out to have an account goes back to the number, with Sign in', async () => {
    mockConfirmPhone.mockRejectedValue({
      field: 'form',
      message: 'This number already has an account. Sign in instead.',
      code: 'account-exists',
    });
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    expect(screen.getByText('This number already has an account.')).toBeTruthy();
    expect(screen.getByTestId('registerPhone.phone')).toBeTruthy();
  });

  it('shows a wrong code and stays on the code', async () => {
    mockConfirmPhone.mockRejectedValue({ field: 'form', message: "That code isn't right. Check and try again." });
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    expect(screen.getByText("That code isn't right. Check and try again.")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('"Change number" returns to the number field, keeping what she typed', async () => {
    render(<RegistrationPhoneScreen />);
    await sendCode();
    fireEvent.press(screen.getByText('Change number'));

    expect(screen.getByTestId('registerPhone.phone').props.value).toBe('1001234567');
    expect(screen.queryByTestId('registerPhone.code')).toBeNull();
  });

  it('holds the resend until the timer runs out', async () => {
    render(<RegistrationPhoneScreen />);
    await sendCode();
    fireEvent.press(screen.getByText(/Resend in \d+s/));
    expect(mockSendOtp).toHaveBeenCalledTimes(1);

    // RESEND_SECONDS is 1 in this file (see the mock above).
    fireEvent.press(await screen.findByText('Resend code', {}, { timeout: 3000 }));
    expect(mockSendOtp).toHaveBeenLastCalledWith({ phone: PHONE, forceResend: true }, expect.anything());
  });

  it('coming back with the number already verified shows it, and Continue goes on', () => {
    mockCurrentUser = { uid: 'uid-new', providerData: [{ providerId: 'phone' }] };
    useRegistrationDraftStore.setState({
      signUpUid: 'uid-new',
      accountPhone: PHONE,
      countryCode: '+20',
      phone: '1001234567',
    });
    render(<RegistrationPhoneScreen />);

    expect(screen.getByText('+20 1001234567 is verified.')).toBeTruthy();
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register-about');
  });
});

describe('Google/Apple wizard', () => {
  beforeEach(() => {
    mockCurrentUser = { uid: 'uid-social', providerData: [{ providerId: 'google.com' }] };
    useRegistrationDraftStore.setState({ authProvider: 'google', signUpUid: 'uid-social' });
  });

  it('a taken number is collision B, before any SMS', async () => {
    mockCheck.mockResolvedValue({ emailTaken: false, phoneTaken: true });
    render(<RegistrationPhoneScreen />);
    typeNumber();
    fireEvent.press(screen.getByText('Send code'));

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledWith(PHONE);
    expect(mockSendLinkCode).not.toHaveBeenCalled();
  });

  it('links the number onto the signed-in account and records it', async () => {
    render(<RegistrationPhoneScreen />);
    await sendCode();
    expect(mockSendLinkCode).toHaveBeenCalledWith({ phone: PHONE, forceResend: false }, expect.anything());
    expect(mockSendOtp).not.toHaveBeenCalled();
    await verify();

    expect(mockLinkPhone).toHaveBeenCalledWith({
      challenge: { verificationId: 'vid', autoVerified: false, code: null },
      code: '111111',
      phone: PHONE,
      signUpUid: 'uid-social',
    });
    expect(useRegistrationDraftStore.getState().accountPhone).toBe(PHONE);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register-about');
  });

  it('a number another account holds, found on link, is collision B', async () => {
    mockLinkPhone.mockRejectedValue({ field: 'phone', message: 'taken', code: 'auth/credential-already-in-use' });
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledWith(PHONE);
  });

  it('an Android instant verification needs no code', async () => {
    mockSendLinkCode.mockImplementationOnce((_v: unknown, o: Opts<unknown>) =>
      o.onSuccess?.({ verificationId: null, autoVerified: true, code: null }),
    );
    render(<RegistrationPhoneScreen />);
    typeNumber();
    fireEvent.press(screen.getByText('Send code'));

    expect(await screen.findByText('Your number was verified automatically.')).toBeTruthy();
    expect(screen.queryByTestId('registerPhone.code')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Verify'));
    });
    expect(mockLinkPhone).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register-about');
  });

  it('drops a spent instant verification after a failed link, and points at resend', async () => {
    mockSendLinkCode.mockImplementationOnce((_v: unknown, o: Opts<unknown>) =>
      o.onSuccess?.({ verificationId: null, autoVerified: true, code: null }),
    );
    mockLinkPhone.mockRejectedValue({ field: 'form', message: 'boom' });
    render(<RegistrationPhoneScreen />);
    typeNumber();
    fireEvent.press(screen.getByText('Send code'));
    await screen.findByText('Your number was verified automatically.');
    await act(async () => {
      fireEvent.press(screen.getByText('Verify'));
    });

    expect(
      screen.getByText("We couldn't confirm your number. Tap Resend code to get a code by SMS."),
    ).toBeTruthy();
    expect(screen.getByText('Resend code')).toBeTruthy();
  });

  it('a session that is no longer this sign-up’s offers Start again', async () => {
    mockLinkPhone.mockRejectedValue({
      field: 'form',
      message: 'Your session ended. Please start again.',
      code: 'session-mismatch',
    });
    render(<RegistrationPhoneScreen />);
    await sendCode();
    await verify();

    fireEvent.press(screen.getByText('Start again'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
