import { z } from 'zod';

// ──────────────────────────────────────────────────────────────
// Addresses — where a booking happens.
//
// A user's location lives here and nowhere else: a mother keeps an
// address book (one entry is the default), a nanny keeps the single
// home base her proximity matching uses. A booking stores the id of
// the address the mother chose AND an id-less snapshot of it, like
// children, so editing or deleting an address never rewrites where
// a past booking sent the nanny. This module imports nothing
// internal so booking.ts, auth.ts and admin.ts can all consume it.
// ──────────────────────────────────────────────────────────────

/** Trimmed text where an emptied field means "not given", not "". */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional()
    .default(null);
}

/**
 * The structured parts Google can fill in for an Egyptian address, plus the
 * ones only the person at the door knows. See parseAddressComponents for
 * which are which. Every part is optional: a pin dropped on a compound
 * resolves to a district and nothing more, and that is still a usable
 * address once the landmark says "Mivida, villa 12".
 */
export const AddressPartsSchema = z.object({
  /** "Cairo", "Giza" — administrative_area_level_1 minus " Governorate". */
  governorate: optionalText(100),
  /** "Maadi", "New Cairo 1" — administrative_area_level_2. */
  area: optionalText(100),
  /** "12 Road 9" — street_number + route, when the pin hit a street. */
  street: optionalText(100),
  building: optionalText(100),
  floor: optionalText(100),
  apartment: optionalText(100),
  /**
   * How to actually find the door — the Egyptian way of giving an address:
   * "behind Seoudi Market, gate 2, ring bell 3". Free text on purpose.
   */
  landmark: optionalText(500),
});

/** Body for POST /addresses and the admin's PUT /nannies/:id/address. */
export const AddressInputSchema = AddressPartsSchema.extend({
  /** Short name the picker shows: "Home", "Work", "Grandma's". */
  label: z.string().trim().min(1, 'Give this address a name.').max(40),
  /** Google's one-line formatted address — the display line everywhere. */
  formattedAddress: z.string().trim().min(1, 'Search for or pin the address.').max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /**
   * Make this the address the booking picker preselects. The first address a
   * user saves becomes the default whether or not this is sent.
   */
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;

/** Body for PATCH /addresses/:id — any subset of the input. */
export const UpdateAddressSchema = AddressInputSchema.partial();
export type UpdateAddressRequest = z.infer<typeof UpdateAddressSchema>;

/** An address as the API returns it. */
export const AddressSchema = AddressInputSchema.omit({ isDefault: true }).extend({
  id: z.number().int(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * The address as a booking recorded it: the source row's id plus every field
 * as it was when the mother chose it. Stored in bookings.booked_address and
 * parsed on read, so a malformed row degrades to "no address" rather than
 * failing a whole bookings list.
 */
export const BookingAddressSchema = AddressInputSchema.omit({ isDefault: true }).extend({
  addressId: z.number().int(),
});
export type BookingAddress = z.infer<typeof BookingAddressSchema>;

/**
 * What a booking says about where it is. `area` is always present so a nanny
 * can judge distance from the open-requests pool; `details` is the full
 * snapshot and is null for her until the booking is confirmed — the mother's
 * home is not shown to nannies who never take the job.
 */
export const BookingLocationSchema = z.object({
  area: z.string(),
  details: BookingAddressSchema.nullable(),
});
export type BookingLocation = z.infer<typeof BookingLocationSchema>;

/**
 * "Maadi, Cairo" — the coarse line shown before an address is revealed. Falls
 * back to the formatted line for rows backfilled from the old single column,
 * which carry no parts.
 */
export function formatAddressArea(a: {
  area: string | null;
  governorate: string | null;
  formattedAddress: string;
}): string {
  const parts = [a.area, a.governorate].filter((p): p is string => !!p && p.trim() !== '');
  return parts.length > 0 ? parts.join(', ') : a.formattedAddress;
}

/** One entry of Google's `address_components` (Geocoding and Place Details). */
export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type ParsedAddressParts = {
  governorate: string | null;
  area: string | null;
  street: string | null;
};

/**
 * The structured parts Google actually provides for Egypt, probed live: there
 * is no `locality`; the governorate is administrative_area_level_1 and the
 * district is level 2. A street is only present when the result is a real
 * street address — a dropped pin often resolves to a plus code or a POI
 * first, so callers should prefer a `street_address` / `premise` result.
 * Building, floor and apartment never come from Google.
 */
export function parseAddressComponents(
  components: readonly GoogleAddressComponent[] | undefined,
): ParsedAddressParts {
  const find = (type: string): string | null =>
    components?.find((c) => c.types.includes(type))?.long_name ?? null;

  const governorate = find('administrative_area_level_1')?.replace(/\s+Governorate$/i, '') ?? null;
  const area = find('administrative_area_level_2');
  const route = find('route');
  const number = find('street_number');
  const street = route ? (number ? `${number} ${route}` : route) : null;

  return { governorate, area, street };
}
