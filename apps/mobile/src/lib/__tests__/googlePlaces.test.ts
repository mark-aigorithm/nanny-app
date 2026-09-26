/**
 * The Google layer's handling of `address_components`: Place Details returns
 * the structured parts alongside the pin, and reverse geocoding prefers a
 * result that is an actual street address over the plus-code / POI that
 * Google lists first for a dropped pin — otherwise the street would be
 * missing on most saved addresses.
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { googlePlacesApiKey: 'test-key' } } },
}));

import { placeDetails, reverseGeocode, reverseGeocodeDetailed } from '@mobile/lib/googlePlaces';

const component = (long: string, ...types: string[]) => ({ long_name: long, short_name: long, types });

const MAADI_STREET = [
  component('12', 'street_number'),
  component('Road 9', 'route'),
  component('Maadi', 'administrative_area_level_2', 'political'),
  component('Cairo Governorate', 'administrative_area_level_1', 'political'),
];

function respond(body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('placeDetails', () => {
  it('asks for address_components and returns the parsed parts with the pin', async () => {
    respond({
      status: 'OK',
      result: {
        formatted_address: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
        geometry: { location: { lat: 29.96, lng: 31.25 } },
        address_components: MAADI_STREET,
      },
    });

    const details = await placeDetails('place-1', 'tok');

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('fields=geometry,formatted_address,address_components');
    expect(details).toEqual({
      latitude: 29.96,
      longitude: 31.25,
      formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
      parts: { governorate: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12' },
    });
  });
});

describe('reverseGeocodeDetailed', () => {
  it('prefers the first street_address result over the plus code Google lists first', async () => {
    respond({
      status: 'OK',
      results: [
        { formatted_address: '2F5R+3G2, New Cairo 1, Egypt', types: ['plus_code'], address_components: [component('2F5R+3G2', 'plus_code')] },
        { formatted_address: '12 Rd 9, Maadi, Cairo Governorate, Egypt', types: ['premise', 'street_address'], address_components: MAADI_STREET },
      ],
    });

    const result = await reverseGeocodeDetailed({ latitude: 29.96, longitude: 31.25 });

    expect(result).toEqual({
      formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
      parts: { governorate: 'Cairo', area: 'Maadi', street: 'Road 9', building: '12' },
    });
  });

  it('falls back to the first result when nothing resolves to a street', async () => {
    respond({
      status: 'OK',
      results: [
        {
          formatted_address: 'New Cairo 1, Cairo Governorate, Egypt',
          types: ['political'],
          address_components: [component('New Cairo 1', 'administrative_area_level_2'), component('Cairo Governorate', 'administrative_area_level_1')],
        },
      ],
    });

    const result = await reverseGeocodeDetailed({ latitude: 30.0, longitude: 31.49 });

    expect(result?.parts).toEqual({ governorate: 'Cairo', area: 'New Cairo 1', street: null, building: null });
  });

  it('takes the street from the nearest route when the pin resolves to a plus-code premise', async () => {
    // Recorded shape for a pin inside a New Cairo block: Google tags the plus
    // code as premise|street_address and only names the road in a later result.
    respond({
      status: 'OK',
      results: [
        {
          formatted_address: '2F5R+3G2, New Cairo 1, Cairo Governorate 4727110, Egypt',
          types: ['premise', 'street_address'],
          address_components: [component('2F5R+3G2', 'plus_code'), component('New Cairo 1', 'administrative_area_level_2'), component('Cairo Governorate', 'administrative_area_level_1')],
        },
        { formatted_address: '2F4R+XG New Cairo 1, Egypt', types: ['plus_code'], address_components: [] },
        {
          formatted_address: 'Zizinia, New Cairo 1, Cairo Governorate, Egypt',
          types: ['route'],
          address_components: [component('Zizinia', 'route'), component('New Cairo 1', 'administrative_area_level_2')],
        },
      ],
    });

    const result = await reverseGeocodeDetailed({ latitude: 30.0074, longitude: 31.4913 });

    expect(result).toEqual({
      formattedAddress: '2F5R+3G2, New Cairo 1, Cairo Governorate 4727110, Egypt',
      parts: { governorate: 'Cairo', area: 'New Cairo 1', street: 'Zizinia', building: null },
    });
  });

  it('prefers a numbered street address over a numberless premise listed before it', async () => {
    respond({
      status: 'OK',
      results: [
        { formatted_address: 'Plus code premise', types: ['premise'], address_components: [component('2F5R+3G2', 'plus_code')] },
        { formatted_address: '12 Rd 9, Maadi, Cairo Governorate, Egypt', types: ['street_address'], address_components: MAADI_STREET },
      ],
    });

    const result = await reverseGeocodeDetailed({ latitude: 29.96, longitude: 31.25 });

    expect(result?.parts).toMatchObject({ street: 'Road 9', building: '12' });
  });

  it('returns null on a non-OK status', async () => {
    respond({ status: 'ZERO_RESULTS', results: [] });
    expect(await reverseGeocodeDetailed({ latitude: 0, longitude: 0 })).toBeNull();
  });
});

describe('reverseGeocode (string form, used by registration)', () => {
  it('still answers with just the preferred formatted line', async () => {
    respond({
      status: 'OK',
      results: [
        { formatted_address: 'plus code', types: ['plus_code'], address_components: [] },
        { formatted_address: '12 Rd 9, Maadi', types: ['street_address'], address_components: MAADI_STREET },
      ],
    });
    expect(await reverseGeocode({ latitude: 29.96, longitude: 31.25 })).toBe('12 Rd 9, Maadi');
  });
});
