import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

/**
 * The address form: what a mother fills in to add or edit a saved address.
 * The search box and the map are stubbed — they talk to Google and the native
 * map; what is under test is how their answers land in the fields and what
 * the form refuses to submit.
 */
const MAADI = {
  coords: { latitude: 29.9602, longitude: 31.2569 },
  address: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
  parts: { governorate: 'Cairo', area: 'Maadi', street: '12 Road 9' },
};

jest.mock('@mobile/components/LocationSearchInput', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onSelectPlace }: { onSelectPlace: (c: unknown, a: string, p: unknown) => void }) =>
      React.createElement(
        Pressable,
        { onPress: () => onSelectPlace(MAADI.coords, MAADI.address, MAADI.parts) },
        React.createElement(Text, null, 'pick maadi'),
      ),
  };
});

jest.mock('@mobile/components/HomeLocationMapCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onChange, errorText }: { onChange: (c: unknown) => void; errorText?: string | null }) =>
      React.createElement(
        Pressable,
        { onPress: () => onChange({ latitude: 30.0074, longitude: 31.4913 }) },
        React.createElement(Text, null, errorText ?? 'drop pin'),
      ),
  };
});

const mockReverse = jest.fn();
jest.mock('@mobile/lib/googlePlaces', () => ({
  reverseGeocodeDetailed: (...args: unknown[]) => mockReverse(...args),
}));

import AddressForm from '@mobile/components/AddressForm';

// Silence the unused-import lint for the RN primitives used only inside mocks.
void Pressable;
void Text;

beforeEach(() => {
  jest.clearAllMocks();
  mockReverse.mockResolvedValue({
    formattedAddress: '2F5R+3G2, New Cairo 1, Cairo Governorate, Egypt',
    parts: { governorate: 'Cairo', area: 'New Cairo 1', street: null },
  });
});

describe('AddressForm', () => {
  it('refuses to save until the address has been searched for or pinned', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(<AddressForm onSubmit={onSubmit} />);

    fireEvent.press(getByText('Save address'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByText('Search for or pin the address.')).toBeTruthy();
  });

  it('fills the parts from a search pick and submits them with the Home label', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByDisplayValue } = render(<AddressForm onSubmit={onSubmit} />);

    fireEvent.press(getByText('pick maadi'));

    expect(getByDisplayValue('Cairo')).toBeTruthy();
    expect(getByDisplayValue('Maadi')).toBeTruthy();
    expect(getByDisplayValue('12 Road 9')).toBeTruthy();

    fireEvent.press(getByText('Save address'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      label: 'Home',
      formattedAddress: MAADI.address,
      governorate: 'Cairo',
      area: 'Maadi',
      street: '12 Road 9',
      latitude: 29.9602,
      longitude: 31.2569,
    });
  });

  it('reverse-geocodes a dropped pin into the line and parts, keeping typed fields', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText, getByDisplayValue } = render(<AddressForm onSubmit={onSubmit} />);

    fireEvent.changeText(getByPlaceholderText('Building'), 'Villa 12');
    fireEvent.press(getByText('drop pin'));

    await waitFor(() => expect(getByDisplayValue('New Cairo 1')).toBeTruthy());
    expect(mockReverse).toHaveBeenCalledWith({ latitude: 30.0074, longitude: 31.4913 });
    expect(getByDisplayValue('Villa 12')).toBeTruthy();

    fireEvent.press(getByText('Save address'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ building: 'Villa 12', street: null, latitude: 30.0074 });
  });

  it('asks for a name when the label is "Other"', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = render(<AddressForm onSubmit={onSubmit} />);

    fireEvent.press(getByText('pick maadi'));
    fireEvent.press(getByText('Other'));
    fireEvent.press(getByText('Save address'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByText('Give this address a name.')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("e.g. Grandma's"), "Grandma's");
    fireEvent.press(getByText('Save address'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].label).toBe("Grandma's");
  });

  it('prefills every field from an existing address and keeps its id out of the payload', async () => {
    const onSubmit = jest.fn();
    const initial = {
      id: 4,
      label: 'Work',
      formattedAddress: 'Smart Village, Giza',
      governorate: 'Giza',
      area: 'Sheikh Zayed',
      street: null,
      building: 'B7',
      floor: '3',
      apartment: null,
      landmark: 'Behind the fountain',
      latitude: 30.07,
      longitude: 31.01,
      isDefault: false,
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const { getByText, getByDisplayValue } = render(<AddressForm initial={initial} onSubmit={onSubmit} />);

    expect(getByDisplayValue('Behind the fountain')).toBeTruthy();
    expect(getByDisplayValue('B7')).toBeTruthy();

    fireEvent.press(getByText('Save address'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ label: 'Work', landmark: 'Behind the fountain', latitude: 30.07 });
    expect('id' in payload).toBe(false);
  });
});
