import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('@mobile/hooks/useNannies', () => ({
  useCertificationCatalog: () => ({ data: [] }),
  useSkillCatalog: () => ({ data: [] }),
}));
// The sheet is a native-feeling picker; capture onSelect so a test can pick a
// time directly.
let mockOnSelect: ((time: string) => void) | undefined;
jest.mock('@mobile/components/TimeSelectSheet', () => {
  const actual = jest.requireActual('@mobile/components/TimeSelectSheet');
  return {
    __esModule: true,
    ...actual,
    default: ({ visible, onSelect }: { visible: boolean; onSelect: (time: string) => void }) => {
      if (visible) mockOnSelect = onSelect;
      return null;
    },
  };
});

import RegistrationNannyDetailsScreen from '@mobile/screens/auth/RegistrationNannyDetailsScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

function fillDetails() {
  useRegistrationDraftStore.setState({
    bio: 'Ten years with toddlers.',
    yearsOfExperience: '10',
    availabilityType: 'FULL_TIME',
    ageRanges: ['1-3'],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnSelect = undefined;
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'nanny' });
});

it('labels itself step 5 of the nanny’s 7', () => {
  render(<RegistrationNannyDetailsScreen />);
  expect(screen.getByText('STEP 5 OF 7 — PROFESSIONAL DETAILS')).toBeTruthy();
});

it('says what is still needed while Continue is off', () => {
  render(<RegistrationNannyDetailsScreen />);
  expect(
    screen.getByText('Still needed: a bio, your years of experience, your availability, an age range.'),
  ).toBeTruthy();

  fireEvent.press(screen.getByText('Continue'));
  expect(mockPush).not.toHaveBeenCalled();
});

it('goes on to the ID step once everything is filled in', () => {
  fillDetails();
  render(<RegistrationNannyDetailsScreen />);
  expect(screen.queryByText(/^Still needed/)).toBeNull();

  fireEvent.press(screen.getByText('Continue'));
  expect(mockPush).toHaveBeenCalledWith('/(auth)/register-nanny-id');
});

it('refuses a working day that ends before it starts, and names the day', () => {
  fillDetails();
  render(<RegistrationNannyDetailsScreen />);

  // Monday's end time (the second time pill on the first row) → 7:00 AM.
  fireEvent.press(screen.getAllByText('6:00 PM')[0]!);
  act(() => mockOnSelect?.('07:00'));

  expect(screen.getByText('Mon has to end after it starts.')).toBeTruthy();
  expect(screen.getByText('Still needed: working hours that end after they start.')).toBeTruthy();
  fireEvent.press(screen.getByText('Continue'));
  expect(mockPush).not.toHaveBeenCalled();
});

it('refuses a working day that ends when it starts', () => {
  fillDetails();
  render(<RegistrationNannyDetailsScreen />);

  fireEvent.press(screen.getAllByText('6:00 PM')[0]!);
  act(() => mockOnSelect?.('08:00'));

  expect(screen.getByText('Mon has to end after it starts.')).toBeTruthy();
});
