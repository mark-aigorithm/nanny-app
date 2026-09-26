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
jest.mock('@mobile/lib/googlePlaces', () => ({ reverseGeocodeDetailed: jest.fn().mockResolvedValue(null) }));

import RegistrationNannyLocationScreen from '@mobile/screens/auth/RegistrationNannyLocationScreen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';
import { reverseGeocodeDetailed } from '@mobile/lib/googlePlaces';

const mockReverseGeocode = reverseGeocodeDetailed as jest.Mock;
const NO_PARTS = { governorate: null, area: null, street: null, building: null };

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
  mockReverseGeocode.mockResolvedValueOnce({ formattedAddress: '5 Nile Street', parts: NO_PARTS });
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

it('fills the street and building from a pin, and clears the old building when the pin moves', async () => {
  mockReverseGeocode
    .mockResolvedValueOnce({
      formattedAddress: '30 Street 11, Maadi, Cairo Governorate, Egypt',
      parts: { governorate: 'Cairo', area: 'Maadi', street: 'Street 11', building: '30' },
    })
    .mockResolvedValueOnce({
      formattedAddress: '2F5R+3G2, New Cairo 1, Cairo Governorate, Egypt',
      parts: { governorate: 'Cairo', area: 'New Cairo 1', street: 'Zizinia', building: null },
    });
  render(<RegistrationNannyLocationScreen />);

  await act(async () => {
    mockOnPinChange?.({ latitude: 29.96, longitude: 31.25 });
  });
  await waitFor(() => expect(screen.getByDisplayValue('Street 11')).toBeTruthy());
  expect(screen.getByDisplayValue('30')).toBeTruthy();
  expect(useRegistrationDraftStore.getState()).toMatchObject({
    address: '30 Street 11, Maadi, Cairo Governorate, Egypt',
    governorate: 'Cairo',
    area: 'Maadi',
    street: 'Street 11',
    building: '30',
  });

  await act(async () => {
    mockOnPinChange?.({ latitude: 30.0, longitude: 31.49 });
  });
  await waitFor(() => expect(screen.getByDisplayValue('Zizinia')).toBeTruthy());
  expect(useRegistrationDraftStore.getState()).toMatchObject({ area: 'New Cairo 1', building: '' });
});

it('keeps a building typed by hand when the pin moves somewhere Google has no number for', async () => {
  mockReverseGeocode.mockResolvedValueOnce({
    formattedAddress: 'New Cairo 1, Cairo Governorate, Egypt',
    parts: { governorate: 'Cairo', area: 'New Cairo 1', street: null, building: null },
  });
  render(<RegistrationNannyLocationScreen />);

  fireEvent.changeText(screen.getByPlaceholderText('No.'), 'Villa 12');
  await act(async () => {
    mockOnPinChange?.({ latitude: 30.0, longitude: 31.49 });
  });

  await waitFor(() => expect(screen.getByDisplayValue('New Cairo 1')).toBeTruthy());
  expect(useRegistrationDraftStore.getState().building).toBe('Villa 12');
});

it('labels itself step 4 of the nanny’s 7', () => {
  render(<RegistrationNannyLocationScreen />);
  expect(screen.getByText('STEP 4 OF 7 — HOME LOCATION')).toBeTruthy();
});
