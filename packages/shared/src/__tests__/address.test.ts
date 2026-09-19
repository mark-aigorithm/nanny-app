import { describe, expect, it } from 'vitest';

import {
  AddressInputSchema,
  BookingAddressSchema,
  UpdateAddressSchema,
  formatAddressArea,
  parseAddressComponents,
} from '../address';

// Shapes recorded from live Geocoding / Place Details calls on 2026-09-19.
// Egypt has no `locality`: the governorate is level 1, the district level 2.
const ZAMALEK_STREET = [
  { long_name: '11', short_name: '11', types: ['street_number'] },
  { long_name: '26th of July Corridor', short_name: '26th of July Corridor', types: ['route'] },
  { long_name: 'Al Gabalayah', short_name: 'Al Gabalayah', types: ['administrative_area_level_3', 'political'] },
  { long_name: 'Zamalek', short_name: 'Zamalek', types: ['administrative_area_level_2', 'political'] },
  { long_name: 'Cairo Governorate', short_name: 'Cairo Governorate', types: ['administrative_area_level_1', 'political'] },
  { long_name: 'Egypt', short_name: 'EG', types: ['country', 'political'] },
  { long_name: '4270123', short_name: '4270123', types: ['postal_code'] },
];

const NEW_CAIRO_PLUS_CODE = [
  { long_name: '2F5R+3G2', short_name: '2F5R+3G2', types: ['plus_code'] },
  { long_name: 'New Cairo 1', short_name: 'New Cairo 1', types: ['administrative_area_level_2', 'political'] },
  { long_name: 'Cairo Governorate', short_name: 'Cairo Governorate', types: ['administrative_area_level_1', 'political'] },
  { long_name: 'Egypt', short_name: 'EG', types: ['country', 'political'] },
];

const ROUTE_ONLY = [
  { long_name: 'Al Mehwar Al Markazi', short_name: 'Al Mehwar Al Markazi', types: ['route'] },
  { long_name: 'First 6th of October', short_name: 'First 6th of October', types: ['administrative_area_level_2', 'political'] },
  { long_name: 'Giza Governorate', short_name: 'Giza Governorate', types: ['administrative_area_level_1', 'political'] },
];

describe('parseAddressComponents', () => {
  it('reads governorate, area and a numbered street off a street_address result', () => {
    expect(parseAddressComponents(ZAMALEK_STREET)).toEqual({
      governorate: 'Cairo',
      area: 'Zamalek',
      street: '11 26th of July Corridor',
    });
  });

  it('leaves the street null when the pin only resolved to a plus code', () => {
    expect(parseAddressComponents(NEW_CAIRO_PLUS_CODE)).toEqual({
      governorate: 'Cairo',
      area: 'New Cairo 1',
      street: null,
    });
  });

  it('uses the route alone when there is no street number', () => {
    expect(parseAddressComponents(ROUTE_ONLY).street).toBe('Al Mehwar Al Markazi');
  });

  it('returns all nulls for an empty or missing component list', () => {
    expect(parseAddressComponents([])).toEqual({ governorate: null, area: null, street: null });
    expect(parseAddressComponents(undefined)).toEqual({ governorate: null, area: null, street: null });
  });
});

describe('formatAddressArea', () => {
  it('joins area and governorate, the line a nanny judges distance by', () => {
    expect(formatAddressArea({ area: 'Maadi', governorate: 'Cairo', formattedAddress: 'x' })).toBe(
      'Maadi, Cairo',
    );
  });

  it('drops a missing half rather than printing a dangling comma', () => {
    expect(formatAddressArea({ area: null, governorate: 'Giza', formattedAddress: 'x' })).toBe('Giza');
    expect(formatAddressArea({ area: 'Smouha', governorate: null, formattedAddress: 'x' })).toBe('Smouha');
  });

  it('falls back to the formatted line for a backfilled row with no parts', () => {
    expect(
      formatAddressArea({ area: null, governorate: null, formattedAddress: '1 Test Street, Cairo' }),
    ).toBe('1 Test Street, Cairo');
  });
});

describe('AddressInputSchema', () => {
  const valid = {
    label: 'Home',
    formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
    latitude: 29.9602,
    longitude: 31.2569,
  };

  it('accepts the minimum a map pick produces and nulls the optional parts', () => {
    const parsed = AddressInputSchema.parse(valid);
    expect(parsed.governorate).toBeNull();
    expect(parsed.landmark).toBeNull();
    expect(parsed.isDefault).toBeUndefined();
  });

  it('trims every text field and turns an emptied one into null', () => {
    const parsed = AddressInputSchema.parse({
      ...valid,
      label: '  Work ',
      street: '  ',
      landmark: ' behind Seoudi Market ',
    });
    expect(parsed.label).toBe('Work');
    expect(parsed.street).toBeNull();
    expect(parsed.landmark).toBe('behind Seoudi Market');
  });

  it('refuses an address with no label or no coordinates', () => {
    expect(AddressInputSchema.safeParse({ ...valid, label: '' }).success).toBe(false);
    expect(AddressInputSchema.safeParse({ ...valid, latitude: undefined }).success).toBe(false);
    expect(AddressInputSchema.safeParse({ ...valid, longitude: 181 }).success).toBe(false);
  });
});

describe('UpdateAddressSchema', () => {
  it('leaves an unsent part untouched instead of clearing it', () => {
    // PATCH semantics: sending only a new landmark must not null the street.
    const parsed = UpdateAddressSchema.parse({ landmark: 'gate 2' });
    expect(parsed).toEqual({ landmark: 'gate 2' });
    expect('street' in parsed).toBe(false);
  });

  it('still lets a part be cleared explicitly', () => {
    expect(UpdateAddressSchema.parse({ street: '' }).street).toBeNull();
    expect(UpdateAddressSchema.parse({ street: null }).street).toBeNull();
  });
});

describe('BookingAddressSchema', () => {
  it('parses a row the migration backfilled (numeric strings, null parts)', () => {
    const parsed = BookingAddressSchema.safeParse({
      addressId: 1,
      label: 'Home',
      formattedAddress: '1 Test Street, Cairo',
      governorate: null,
      area: null,
      street: null,
      building: null,
      floor: null,
      apartment: null,
      landmark: null,
      latitude: 30.0444,
      longitude: 31.2357,
    });
    expect(parsed.success).toBe(true);
  });
});
