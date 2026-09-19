import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { BookingAddressCard } from '@mobile/components/booking/BookingAddressCard';

const DETAILS = {
  addressId: 7,
  label: 'Work',
  formattedAddress: 'Smart Village, Giza Governorate, Egypt',
  governorate: 'Giza',
  area: 'Sheikh Zayed',
  street: null,
  building: 'B7',
  floor: '3',
  apartment: '12',
  landmark: 'Behind the fountain',
  latitude: 30.0716,
  longitude: 31.0165,
};

describe('BookingAddressCard', () => {
  it('renders nothing for a booking with no address', () => {
    const { toJSON } = render(<BookingAddressCard address={null} />);
    expect(toJSON()).toBeNull();
  });

  it('shows only the area, and says why, while the address is withheld', () => {
    const { getByText, queryByText } = render(
      <BookingAddressCard address={{ area: 'Sheikh Zayed, Giza', details: null }} />,
    );

    expect(getByText('Sheikh Zayed, Giza')).toBeTruthy();
    expect(getByText('Full address once the booking is confirmed')).toBeTruthy();
    expect(queryByText('Open in Maps')).toBeNull();
  });

  it('shows the whole address, the door details and the landmark once revealed', () => {
    const { getByText } = render(
      <BookingAddressCard address={{ area: 'Sheikh Zayed, Giza', details: DETAILS }} />,
    );

    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Smart Village, Giza Governorate, Egypt')).toBeTruthy();
    expect(getByText('Building B7 · Floor 3 · Apt 12')).toBeTruthy();
    expect(getByText('Behind the fountain')).toBeTruthy();
  });

  it('opens the pin in the maps app', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = render(
      <BookingAddressCard address={{ area: 'Sheikh Zayed, Giza', details: DETAILS }} />,
    );

    fireEvent.press(getByText('Open in Maps'));

    expect(openUrl).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=30.0716%2C31.0165',
    );
    openUrl.mockRestore();
  });
});
