import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({}),
}));

import { api } from '@mobile/lib/api';
import { auth } from '@mobile/lib/firebase';
import RoleSelectionScreen from '@mobile/screens/auth/RoleSelectionScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

/** What a mother has typed into step 1 before changing her mind. */
function halfTypedMotherDraft() {
  useRegistrationDraftStore.getState().patch({
    role: 'parent',
    firstName: 'Mona',
    lastName: 'Adel',
    phone: '1001234567',
    email: 'mona@example.com',
    dob: '1991-02-03',
    password: 'hunter2hunter2',
    address: '1 Test Street',
  });
}

// The screen now renders SocialAuthButtons, whose useSocialSignIn needs a
// QueryClientProvider. Rendering also starts async work that sets state once
// it lands — Ionicons' font load, SocialAuthButtons' Apple check — so let it
// settle inside act() before the test goes on.
async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <RoleSelectionScreen />
    </QueryClientProvider>,
  );
  await act(async () => {});
  return rendered;
}

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
});

describe('RoleSelectionScreen', () => {
  it('throws a half-typed draft away when a different role is chosen', async () => {
    halfTypedMotherDraft();
    const { getByText } = await renderScreen();

    fireEvent.press(getByText("I'm a nanny"));
    fireEvent.press(getByText('Sign up as a nanny'));

    const draft = useRegistrationDraftStore.getState();
    expect(draft.role).toBe('nanny');
    expect(draft.firstName).toBe('');
    expect(draft.lastName).toBe('');
    expect(draft.phone).toBe('');
    expect(draft.email).toBe('');
    expect(draft.password).toBe('');
    expect(draft.address).toBe('');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/register-step-1',
      params: { role: 'nanny' },
    });
  });

  it('starts every attempt from a clean draft, even for the same role', async () => {
    halfTypedMotherDraft();
    const { getByText } = await renderScreen();

    fireEvent.press(getByText("I'm a mother"));
    fireEvent.press(getByText('Sign up as a mother'));

    const draft = useRegistrationDraftStore.getState();
    expect(draft.role).toBe('parent');
    expect(draft.firstName).toBe('');
    expect(draft.password).toBe('');
  });

  it('does nothing until a role is picked', async () => {
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Continue'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegistrationDraftStore.getState().role).toBeNull();
  });

  it('offers Google beside the role choice', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('keeps a Google draft on Continue and hides the social buttons', async () => {
    useRegistrationDraftStore.setState({ authProvider: 'google', email: 'mona@gmail.com', firstName: 'Mona' });
    const { getByText, queryByText } = await renderScreen();

    expect(
      getByText('Signed in with Google as mona@gmail.com. Tell us who you are to finish setting up.'),
    ).toBeTruthy();
    expect(queryByText('Continue with Google')).toBeNull();

    fireEvent.press(getByText("I'm a mother"));
    fireEvent.press(getByText('Sign up as a mother'));

    expect(useRegistrationDraftStore.getState()).toMatchObject({
      role: 'parent',
      authProvider: 'google',
      firstName: 'Mona',
      email: 'mona@gmail.com',
    });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-1', params: { role: 'parent' } });
  });

  it('offers no way out of a social sign-up when there is none', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText('Use a different sign-up method')).toBeNull();
  });

  it('discards the unfinished Google account and goes back to the phone sign-up, social buttons and all', async () => {
    useRegistrationDraftStore.setState({
      authProvider: 'google',
      signUpUid: 'uid-social',
      email: 'mona@gmail.com',
      firstName: 'Mona',
    });
    const { getByText, findByText, queryByText } = await renderScreen();

    fireEvent.press(getByText('Use a different sign-up method'));

    expect(await findByText('Continue with Google')).toBeTruthy();
    expect(getByText('Tell us who you are so we can set up the right experience for you.')).toBeTruthy();
    expect(queryByText('Use a different sign-up method')).toBeNull();
    // The server deletes it only if no row points at it; either way she is signed out.
    expect(api.delete).toHaveBeenCalledWith('/auth/me');
    expect(auth().signOut).toHaveBeenCalledTimes(1);
    expect(useRegistrationDraftStore.getState()).toMatchObject({
      authProvider: 'phone',
      signUpUid: null,
      email: '',
      firstName: '',
    });
    // She stays here, now choosing a role for the phone sign-up.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('finishes setting up a resumed phone account, keeping its seed', async () => {
    useRegistrationDraftStore.setState({
      isResume: true,
      signUpUid: 'uid-leftover',
      authProvider: 'phone',
      countryCode: '+20',
      phone: '1001234567',
      accountPhone: '+201001234567',
      email: '',
    });
    const { getByText, queryByText } = await renderScreen();

    expect(getByText('Finish setting up your account')).toBeTruthy();
    expect(queryByText('Create your account')).toBeNull();
    expect(getByText('Signed in as +20 1001234567. Tell us who you are to finish setting up.')).toBeTruthy();
    // Account-backed: no second sign-in method on offer, but a way out.
    expect(queryByText('Continue with Google')).toBeNull();
    expect(getByText('Use a different sign-up method')).toBeTruthy();

    fireEvent.press(getByText("I'm a nanny"));
    fireEvent.press(getByText('Sign up as a nanny'));

    expect(useRegistrationDraftStore.getState()).toMatchObject({
      role: 'nanny',
      isResume: true,
      signUpUid: 'uid-leftover',
      phone: '1001234567',
      accountPhone: '+201001234567',
    });
  });

  it('names a resumed account by its email when it has one', async () => {
    useRegistrationDraftStore.setState({
      isResume: true,
      signUpUid: 'uid-leftover',
      authProvider: 'google',
      email: 'mona@gmail.com',
    });
    const { getByText } = await renderScreen();

    expect(getByText('Finish setting up your account')).toBeTruthy();
    expect(getByText('Signed in as mona@gmail.com. Tell us who you are to finish setting up.')).toBeTruthy();
  });

  it('discards a resumed account and falls back to the phone sign-up', async () => {
    useRegistrationDraftStore.setState({
      isResume: true,
      signUpUid: 'uid-leftover',
      authProvider: 'phone',
      phone: '1001234567',
    });
    const { getByText, findByText } = await renderScreen();

    fireEvent.press(getByText('Use a different sign-up method'));

    expect(await findByText('Create your account')).toBeTruthy();
    expect(api.delete).toHaveBeenCalledWith('/auth/me');
    expect(useRegistrationDraftStore.getState()).toMatchObject({ isResume: false, signUpUid: null, phone: '' });
  });

  it('goes back to sign-in rather than stacking a second copy', async () => {
    const { getByText } = await renderScreen();
    fireEvent.press(getByText('Sign in'));
    expect(mockDismissTo).toHaveBeenCalledWith('/(auth)/sign-in');
    expect(mockPush).not.toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
