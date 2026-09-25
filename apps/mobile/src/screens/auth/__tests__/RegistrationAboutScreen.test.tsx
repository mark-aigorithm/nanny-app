import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The router is the per-file mock; firebase, the API layer, the image picker
// and safe-area insets come from the global jest.setup.js.
const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), dismissTo: mockDismissTo }),
}));

const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
}));
const mockUpload = jest.fn();
jest.mock('@mobile/lib/storage', () => ({
  uploadImageToFirebase: (...args: unknown[]) => mockUpload(...args),
}));

// Native date picker has no jest implementation; the screen only mounts it
// inside a closed modal, so an empty component is enough.
jest.mock('@react-native-community/datetimepicker', () => () => null);

// Pulls in expo-asset at import; the real thing only matters under E2E.
jest.mock('@mobile/lib/e2eImage', () => ({
  e2ePlaceholderImageUri: jest.fn().mockResolvedValue(null),
}));

import { api } from '@mobile/lib/api';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import RegistrationAboutScreen from '@mobile/screens/auth/RegistrationAboutScreen';

const mockPost = api.post as jest.Mock;

const PHONE = '+201234567893';
const PHOTO = 'file:///photo.jpg';
const EMAIL_TAKEN = 'An account with this email already exists.';

/** A fully filled "About you", after "Your number" verified the phone. */
function fillDraft(extra: Record<string, unknown> = {}) {
  useRegistrationDraftStore.setState({
    role: 'parent',
    accountPhone: PHONE,
    signUpUid: 'uid-1',
    firstName: 'Nanny',
    lastName: 'Test',
    email: 'Mark3Essam@gmail.com',
    dob: '05/10/1998',
    photoUri: PHOTO,
    ...extra,
  });
}

function availability(emailTaken: boolean, phoneTaken = false) {
  return { data: { data: { emailTaken, phoneTaken }, error: null } };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationAboutScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  fillDraft();
  mockUpload.mockResolvedValue('https://storage.test/avatars/uid-1/photo.jpg');
});

it('labels itself step 2 of the mother’s 5, and has no phone field', () => {
  renderScreen();
  expect(screen.getByText('STEP 2 OF 5 — ABOUT YOU')).toBeTruthy();
  expect(screen.queryByPlaceholderText('100 000 0000')).toBeNull();
});

describe('validation', () => {
  it('shows every missing field under itself at once, and asks nobody', () => {
    useRegistrationDraftStore.setState({ photoUri: null, firstName: '', lastName: '', email: '', dob: '' });
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('A profile photo is required.')).toBeTruthy();
    expect(screen.getByText('Please enter your first name.')).toBeTruthy();
    expect(screen.getByText('Please enter your last name.')).toBeTruthy();
    expect(screen.getByText('Please enter your email address.')).toBeTruthy();
    expect(screen.getByText('Please select your date of birth.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears a field’s error as soon as that field is edited, leaving the others', () => {
    useRegistrationDraftStore.setState({ firstName: '', lastName: '' });
    renderScreen();
    fireEvent.press(screen.getByText('Continue'));

    fireEvent.changeText(screen.getByPlaceholderText('Enter your first name'), 'Mona');
    expect(screen.queryByText('Please enter your first name.')).toBeNull();
    expect(screen.getByText('Please enter your last name.')).toBeTruthy();
  });

  it('refuses someone under 18 before asking the API anything', () => {
    useRegistrationDraftStore.setState({ dob: `01/01/${new Date().getFullYear() - 17}` });
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(screen.getByText('You must be at least 18 to use NannyNow.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe('Continue', () => {
  it('checks the normalised email with her verified phone, uploads the photo, and goes on', async () => {
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/register-account'));
    expect(mockPost).toHaveBeenCalledWith('/auth/availability', {
      email: 'mark3essam@gmail.com',
      phone: PHONE,
    });
    expect(mockUpload).toHaveBeenCalledWith(PHOTO, 'avatars');
    expect(useRegistrationDraftStore.getState().avatarUpload).toEqual({
      uri: PHOTO,
      url: 'https://storage.test/avatars/uid-1/photo.jpg',
    });
  });

  it('does not upload the same photo twice', async () => {
    fillDraft({ avatarUpload: { uri: PHOTO, url: 'https://storage.test/old.jpg' } });
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('uploads again when the photo changed', async () => {
    fillDraft({ avatarUpload: { uri: 'file:///old.jpg', url: 'https://storage.test/old.jpg' } });
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockUpload).toHaveBeenCalledWith(PHOTO, 'avatars');
  });

  it('stays put, with the reason in the banner, when the upload fails', async () => {
    mockPost.mockResolvedValueOnce(availability(false));
    mockUpload.mockRejectedValueOnce(new Error('offline'));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText("Couldn't upload your photo. Check your connection and try again.")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('flags a taken email under the field and stays put', async () => {
    mockPost.mockResolvedValueOnce(availability(true));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText(EMAIL_TAKEN)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('says so when her number was registered by someone else in the meantime', async () => {
    mockPost.mockResolvedValueOnce(availability(false, true));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('An account with this phone number already exists.')).toBeTruthy();
    expect(screen.queryByText(EMAIL_TAKEN)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('forgets an email code proved for a different address', async () => {
    fillDraft({ emailVerificationToken: 'tok', verifiedEmail: 'old@example.com' });
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(useRegistrationDraftStore.getState()).toMatchObject({
      emailVerificationToken: null,
      verifiedEmail: null,
    });
  });

  it('keeps an email code proved for this very address', async () => {
    fillDraft({ emailVerificationToken: 'tok', verifiedEmail: 'mark3essam@gmail.com' });
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(useRegistrationDraftStore.getState().emailVerificationToken).toBe('tok');
  });

  it('stays with the API error when the check itself fails', async () => {
    mockPost.mockRejectedValueOnce(new Error('Too many requests. Please try again in an hour.'));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('Too many requests. Please try again in an hour.')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('Google/Apple sign-up', () => {
  beforeEach(() => {
    fillDraft({ authProvider: 'google', email: 'mona@gmail.com' });
  });

  it('shows the provider-verified email read-only, and counts the social steps', () => {
    renderScreen();

    expect(screen.getByDisplayValue('mona@gmail.com').props.editable).toBe(false);
    expect(screen.getByText('Verified by Google')).toBeTruthy();
    expect(screen.getByText('STEP 2 OF 4 — ABOUT YOU')).toBeTruthy();
  });

  it('goes straight to the location — no "Secure your account"', async () => {
    mockPost.mockResolvedValueOnce(availability(false));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(auth)/register-location'));
  });

  it('hands a taken email to the collision flow instead of flagging the field', async () => {
    mockPost.mockResolvedValueOnce(availability(true));
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledWith(PHONE);
    expect(screen.queryByText(EMAIL_TAKEN)).toBeNull();
  });

  it('keeps Continue disabled while the collision hand-off runs', async () => {
    mockPost.mockResolvedValueOnce(availability(true));
    let finishHandOff: () => void = () => undefined;
    mockAbandon.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHandOff = resolve;
        }),
    );
    renderScreen();

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() => expect(mockAbandon).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('Continue'));
    expect(mockPost).toHaveBeenCalledTimes(1);

    finishHandOff();
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledTimes(1);
  });
});
