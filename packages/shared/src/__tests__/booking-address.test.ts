import { describe, expect, it } from 'vitest';

import {
  AdminEditBookingSchema,
  AdminMotherDetailSchema,
  AdminNannyDetailSchema,
  AdminUpsertNannyAddressSchema,
  UpdateAdminNannySchema,
} from '../admin';
import { UpdateProfileRequestSchema } from '../auth';
import { CreateBookingSchema } from '../booking';
import { UpdateNannyProfileRequestSchema } from '../nanny';

const validBooking = {
  startTime: '2026-10-01T09:00:00',
  endTime: '2026-10-01T13:00:00',
  children: [{ ageYears: 3 }],
  addressId: 7,
};

describe('CreateBookingSchema', () => {
  it('requires the address the mother chose', () => {
    const { addressId: _omit, ...withoutAddress } = validBooking;
    expect(CreateBookingSchema.safeParse(withoutAddress).success).toBe(false);
    expect(CreateBookingSchema.safeParse({ ...validBooking, addressId: 0 }).success).toBe(false);
    expect(CreateBookingSchema.parse(validBooking).addressId).toBe(7);
  });

  it('no longer carries loose coordinates — the address is the location', () => {
    const parsed = CreateBookingSchema.parse({ ...validBooking, latitude: 30, longitude: 31 });
    expect('latitude' in parsed).toBe(false);
  });
});

describe('UpdateProfileRequestSchema', () => {
  it('drops address and coordinates — those are edited through /addresses', () => {
    const parsed = UpdateProfileRequestSchema.parse({ firstName: 'Sara', address: 'x', latitude: 30 });
    expect(parsed).toEqual({ firstName: 'Sara' });
  });
});

describe('admin schemas', () => {
  it('edits a booking location by choosing one of the mother addresses, not loose coordinates', () => {
    const base = { startTime: '2026-10-01T09:00:00', endTime: '2026-10-01T13:00:00', children: [{ ageYears: 3 }] };
    const parsed = AdminEditBookingSchema.parse({ ...base, addressId: 3, latitude: 30 });
    expect(parsed.addressId).toBe(3);
    expect('latitude' in parsed).toBe(false);
    expect(AdminEditBookingSchema.parse(base).addressId).toBeUndefined();
  });

  it('no longer takes a free-text nanny location on the profile patch', () => {
    expect(UpdateAdminNannySchema.safeParse({ location: 'Maadi' }).success).toBe(false);
  });

  it('upserts a nanny address without a label or default flag — she has exactly one', () => {
    const parsed = AdminUpsertNannyAddressSchema.parse({
      formattedAddress: '12 Rd 9, Maadi',
      latitude: 29.96,
      longitude: 31.25,
      label: 'ignored',
      isDefault: false,
    });
    expect('label' in parsed).toBe(false);
    expect('isDefault' in parsed).toBe(false);
  });

  it('carries the address book on the detail pages', () => {
    expect(AdminMotherDetailSchema.shape.addresses).toBeDefined();
    expect(AdminNannyDetailSchema.shape.address).toBeDefined();
  });
});

describe('UpdateNannyProfileRequestSchema', () => {
  it('drops location — a nanny address is set at registration and edited by admins', () => {
    const parsed = UpdateNannyProfileRequestSchema.parse({ bio: 'hi', location: 'Maadi' });
    expect('location' in parsed).toBe(false);
  });
});
