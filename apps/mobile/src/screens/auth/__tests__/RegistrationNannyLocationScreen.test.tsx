import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
// The map and the places search are native/network surfaces; Continue's guard
// only reads the draft. The map mock renders its errorText prop as text so a
// duplicate-rendered error (also shown under the address input) is caught,
// and captures the onChange handler so a test can simulate a pin move.
let mockOnPinChange: ((coords: { latitude: number; longitude: number }) => void) | undefined;
jest.mock('@mobile/components/HomeLocationMapCard', () => {
  const { Text } = require('react-native');
  return ({
    errorText,
    onChange,
  }: {
    errorText?: string | null;
    onChange?: (coords: { latitude: number; longitude: number }) => void;
  }) => {
    mockOnPinChange = onChange;
    return errorText ? <Text>{errorText}</Text> : null;
  };
});
jest.mock('@mobile/components/LocationSearchInput', () => () => null);
jest.mock('@mobile/lib/googlePlaces', () => ({ reverseGeocode: jest.fn().mockResolvedValue(null) }));

import RegistrationNannyLocationScreen from '@mobile/screens/auth/RegistrationNannyLocationScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { reverseGeocode } from '@mobile/lib/googlePlaces';

const mockReverseGeocode = reverseGeocode as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockOnPinChange = undefined;
  mockReverseGeocode.mockResolvedValue(null);
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'nanny', latitude: 30.04, longitude: 31.23 });
});

it('asks for a street address when the pin is set but the line is empty', () => {
  useRegistrationDraftStore.setState({ address: '   ' });
  render(<RegistrationNannyLocationScreen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(screen.getAllByText('Please enter your street address.')).toHaveLength(1);
  expect(mockPush).not.toHaveBeenCalled();
});

it('moves on to her professional details with a pin and a street address', () => {
  useRegistrationDraftStore.setState({ address: '1 Test Street, Cairo' });
  render(<RegistrationNannyLocationScreen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(mockPush).toHaveBeenCalledWith('/(auth)/register-nanny-details');
});

it('asks for a home location when the pin is missing', () => {
  useRegistrationDraftStore.setState({ latitude: null, longitude: null, address: '1 Test Street, Cairo' });
  render(<RegistrationNannyLocationScreen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(screen.getAllByText('Please set your home location on the map.')).toHaveLength(1);
  expect(mockPush).not.toHaveBeenCalled();
});

it('clears the address error once a pin move fills in a street line', async () => {
  useRegistrationDraftStore.setState({ address: '   ' });
  mockReverseGeocode.mockResolvedValueOnce('5 Nile Street');
  render(<RegistrationNannyLocationScreen />);

  fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByText('Please enter your street address.')).toBeTruthy();

  await act(async () => {
    mockOnPinChange?.({ latitude: 30.05, longitude: 31.24 });
  });

  await waitFor(() => {
    expect(screen.queryByText('Please enter your street address.')).toBeNull();
  });
});

it('labels itself step 4 of the nanny’s 7', () => {
  render(<RegistrationNannyLocationScreen />);
  expect(screen.getByText('STEP 4 OF 7 — HOME LOCATION')).toBeTruthy();
});
