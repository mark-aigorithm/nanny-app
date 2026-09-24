import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Router + route params are the per-file mocks; firebase, the API layer, the
// image picker and safe-area insets come from the global jest.setup.js.
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace, dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));

const mockAbandon = jest.fn().mockResolvedValue(undefined);
jest.mock('@mobile/lib/pendingLink', () => ({
  abandonSocialSignUpForLink: (...args: unknown[]) => mockAbandon(...args),
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
import RegistrationStep1Screen from '@mobile/screens/auth/RegistrationStep1Screen';

const mockPost = api.post as jest.Mock;

const EMAIL_TAKEN = 'An account with this email already exists.';
const PHONE_TAKEN = 'An account with this phone number already exists.';

/** A fully filled step 1, so only the availability check stands between Continue and step 2. */
function fillDraft() {
  useRegistrationDraftStore.setState({
    role: 'parent',
    firstName: 'Nanny',
    lastName: 'Test',
    email: 'Mark3Essam@gmail.com',
    countryCode: '+20',
    phone: '1234567893',
    dob: '05/10/1998',
    photoUri: 'file:///photo.jpg',
  });
}

function availability(emailTaken: boolean, phoneTaken: boolean) {
  return { data: { data: { emailTaken, phoneTaken }, error: null } };
}

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistrationStep1Screen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  fillDraft();
});

describe('RegistrationStep1Screen — availability check on Continue', () => {
  it('asks the API with the normalised email and E.164 phone, then moves on when both are free', async () => {
    mockPost.mockResolvedValueOnce(availability(false, false));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/availability', {
        email: 'mark3essam@gmail.com',
        phone: '+201234567893',
      }),
    );
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(auth)/register-email',
        params: { role: 'parent' },
      }),
    );
  });

  it('flags a taken email under the field and stays put', async () => {
    mockPost.mockResolvedValueOnce(availability(true, false));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());
    expect(queryByText(PHONE_TAKEN)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('flags a taken phone under the field and stays put', async () => {
    mockPost.mockResolvedValueOnce(availability(false, true));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(PHONE_TAKEN)).toBeTruthy());
    expect(queryByText(EMAIL_TAKEN)).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('flags both at once', async () => {
    mockPost.mockResolvedValueOnce(availability(true, true));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());
    expect(getByText(PHONE_TAKEN)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears a field error as soon as that field is edited', async () => {
    mockPost.mockResolvedValueOnce(availability(true, true));
    const { getByText, queryByText, getByPlaceholderText } = renderScreen();

    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(getByText(EMAIL_TAKEN)).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('you@example.com'), 'other@example.com');
    expect(queryByText(EMAIL_TAKEN)).toBeNull();
    // The phone error is untouched until the phone changes.
    expect(getByText(PHONE_TAKEN)).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('100 000 0000'), '1000000000');
    expect(queryByText(PHONE_TAKEN)).toBeNull();
  });

  it('stays on the screen with the API error when the check itself fails', async () => {
    // `unwrap` turns every failure into an Error carrying user-facing copy;
    // a server message passes straight through, a technical one becomes the
    // generic fallback. Either way the user stays here and is told.
    mockPost.mockRejectedValueOnce(new Error('Too many requests. Please try again in an hour.'));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(getByText('Too many requests. Please try again in an hour.')).toBeTruthy(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to generic copy when the failure is technical, and still stays put', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network Error'));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText('Something went wrong. Please try again.')).toBeTruthy());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not call the API while local validation is still failing', () => {
    useRegistrationDraftStore.setState({ email: 'not-an-address' });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('RegistrationStep1Screen — Google/Apple sign-up', () => {
  function fillSocialDraft() {
    fillDraft();
    useRegistrationDraftStore.setState({ authProvider: 'google', email: 'mona@gmail.com' });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    useRegistrationDraftStore.getState().reset();
  });

  it('shows the provider-verified email read-only and counts three steps', () => {
    fillSocialDraft();
    const { getByDisplayValue, getByText } = renderScreen();

    expect(getByDisplayValue('mona@gmail.com').props.editable).toBe(false);
    expect(getByText('Verified by Google')).toBeTruthy();
    expect(getByText('STEP 1 OF 3 — PERSONAL INFO')).toBeTruthy();
  });

  it('skips the email-code and password steps', async () => {
    fillSocialDraft();
    mockPost.mockResolvedValueOnce(availability(false, false));
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-2', params: { role: 'parent' } }),
    );
  });

  it('hands a taken phone to the collision flow instead of flagging the field', async () => {
    fillSocialDraft();
    mockPost.mockResolvedValueOnce(availability(false, true));
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledWith('+201234567893');
    expect(queryByText(PHONE_TAKEN)).toBeNull();
  });

  it('keeps Continue disabled while the collision hand-off runs', async () => {
    fillSocialDraft();
    mockPost.mockResolvedValueOnce(availability(false, true));
    let finishHandOff: () => void = () => undefined;
    mockAbandon.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishHandOff = resolve;
        }),
    );
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(mockAbandon).toHaveBeenCalledTimes(1));
    // A second tap while the throwaway account is being deleted must not
    // check availability, or hand off, a second time.
    fireEvent.press(getByText('Continue'));
    expect(mockPost).toHaveBeenCalledTimes(1);

    finishHandOff();
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in'));
    expect(mockAbandon).toHaveBeenCalledTimes(1);
  });
});

describe('RegistrationStep1Screen — date of birth', () => {
  it('refuses someone under 18 before asking the API anything', async () => {
    const now = new Date();
    const seventeen = `01/01/${now.getFullYear() - 17}`;
    useRegistrationDraftStore.setState({ dob: seventeen });
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Continue'));

    await waitFor(() => expect(getByText('You must be at least 18 to use NannyNow.')).toBeTruthy());
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
