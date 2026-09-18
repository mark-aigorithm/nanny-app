import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
});

describe('RoleSelectionScreen', () => {
  it('throws a half-typed draft away when a different role is chosen', () => {
    halfTypedMotherDraft();
    const { getByText } = render(<RoleSelectionScreen />);

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

  it('starts every attempt from a clean draft, even for the same role', () => {
    halfTypedMotherDraft();
    const { getByText } = render(<RoleSelectionScreen />);

    fireEvent.press(getByText("I'm a mother"));
    fireEvent.press(getByText('Sign up as a mother'));

    const draft = useRegistrationDraftStore.getState();
    expect(draft.role).toBe('parent');
    expect(draft.firstName).toBe('');
    expect(draft.password).toBe('');
  });

  it('does nothing until a role is picked', () => {
    const { getByText } = render(<RoleSelectionScreen />);
    fireEvent.press(getByText(/continue/i));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useRegistrationDraftStore.getState().role).toBeNull();
  });
});
