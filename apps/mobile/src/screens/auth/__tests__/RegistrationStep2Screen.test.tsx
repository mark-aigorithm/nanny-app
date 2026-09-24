import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));
// The map and the places search are native/network surfaces; Continue's guard
// only reads the draft. The map mock renders its errorText prop as text so a
// duplicate-rendered error (also shown under the address input) is caught.
jest.mock('@mobile/components/HomeLocationMapCard', () => {
  const { Text } = require('react-native');
  return ({ errorText }: { errorText?: string | null }) =>
    errorText ? <Text>{errorText}</Text> : null;
});
jest.mock('@mobile/components/LocationSearchInput', () => () => null);
jest.mock('@mobile/lib/googlePlaces', () => ({ reverseGeocode: jest.fn().mockResolvedValue(null) }));

import RegistrationStep2Screen from '@mobile/screens/auth/RegistrationStep2Screen';
import { useRegistrationDraftStore } from '@mobile/store/registrationDraftStore';

beforeEach(() => {
  jest.clearAllMocks();
  useRegistrationDraftStore.getState().reset();
  useRegistrationDraftStore.setState({ role: 'parent', latitude: 30.04, longitude: 31.23 });
});

it('asks for a street address when the pin is set but the line is empty', () => {
  useRegistrationDraftStore.setState({ address: '   ' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(screen.getAllByText('Please enter your street address.')).toHaveLength(1);
  expect(mockPush).not.toHaveBeenCalled();
});

it('moves on with a pin and a street address', () => {
  useRegistrationDraftStore.setState({ address: '1 Test Street, Cairo' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-3', params: { role: 'parent' } });
});

it('asks for a home location when the pin is missing', () => {
  useRegistrationDraftStore.setState({ latitude: null, longitude: null, address: '1 Test Street, Cairo' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(screen.getAllByText('Please set your home location on the map.')).toHaveLength(1);
  expect(mockPush).not.toHaveBeenCalled();
});
