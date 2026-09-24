import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ role: 'parent' }),
}));
// The map and the places search are native/network surfaces; Continue's guard
// only reads the draft.
jest.mock('@mobile/components/HomeLocationMapCard', () => () => null);
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

  expect(screen.getByText('Please enter your street address.')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it('moves on with a pin and a street address', () => {
  useRegistrationDraftStore.setState({ address: '1 Test Street, Cairo' });
  render(<RegistrationStep2Screen />);

  fireEvent.press(screen.getByText('Continue'));

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(auth)/register-step-3', params: { role: 'parent' } });
});
