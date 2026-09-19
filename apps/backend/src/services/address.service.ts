import {
  Role,
  type Address as AddressDto,
  type AddressInput,
  type AdminUpsertNannyAddressInput,
  type BookingAddress,
  type UpdateAddressRequest,
} from '@nanny-app/shared';
import type { Address, Prisma, User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';

/**
 * A user's addresses — the single source of location for everything: the
 * booking picker, the broadcast radius, proximity search, and the line a nanny
 * is sent to.
 *
 * Exactly one live address per user is the default. Nothing in the database
 * enforces that (Prisma cannot declare a partial unique index), so every write
 * that touches `isDefault` here runs in a transaction that clears the previous
 * default first. Callers already inside a transaction (registerUser) pass
 * theirs in so the address can't commit without the thing that asked for it.
 */

type Client = Prisma.TransactionClient;

const ADDRESS_SELECT = {
  id: true,
  userId: true,
  label: true,
  formattedAddress: true,
  governorate: true,
  area: true,
  street: true,
  building: true,
  floor: true,
  apartment: true,
  landmark: true,
  latitude: true,
  longitude: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.AddressSelect;

type AddressRow = Pick<Address, keyof typeof ADDRESS_SELECT>;

/** Default first, then oldest first — the order the picker shows. */
const LIST_ORDER: Prisma.AddressOrderByWithRelationInput[] = [{ isDefault: 'desc' }, { id: 'asc' }];

export function toAddressDto(row: AddressRow): AddressDto {
  return {
    id: row.id,
    label: row.label,
    formattedAddress: row.formattedAddress,
    governorate: row.governorate,
    area: row.area,
    street: row.street,
    building: row.building,
    floor: row.floor,
    apartment: row.apartment,
    landmark: row.landmark,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The address as a booking records it — every field as it is now, plus the
 * row id so the booking can still be tied back to the entry it was made from.
 */
export function toBookingAddressSnapshot(row: AddressRow): BookingAddress {
  return {
    addressId: row.id,
    label: row.label,
    formattedAddress: row.formattedAddress,
    governorate: row.governorate,
    area: row.area,
    street: row.street,
    building: row.building,
    floor: row.floor,
    apartment: row.apartment,
    landmark: row.landmark,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

async function listRows(client: Client, userId: number): Promise<AddressRow[]> {
  return client.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: LIST_ORDER,
    select: ADDRESS_SELECT,
  });
}

/** A user's live addresses, default first. */
export async function listAddresses(userId: number): Promise<AddressDto[]> {
  const rows = await listRows(prisma, userId);
  return rows.map(toAddressDto);
}

/**
 * The user's default address row, or null when they have none. This is what
 * every former reader of users.latitude/longitude calls — proximity search,
 * the broadcast radius, the flattened location on the profile response.
 */
export async function getDefaultAddress(
  userId: number,
  client: Client = prisma,
): Promise<AddressRow | null> {
  return client.address.findFirst({
    where: { userId, deletedAt: null, isDefault: true },
    select: ADDRESS_SELECT,
  });
}

/** One address the user owns, live, or a 404 — never someone else's row. */
async function requireOwned(client: Client, userId: number, id: number): Promise<AddressRow> {
  const row = await client.address.findFirst({
    where: { id, userId, deletedAt: null },
    select: ADDRESS_SELECT,
  });
  if (!row) throw errors.notFound('Address not found.');
  return row;
}

async function clearDefault(client: Client, userId: number): Promise<void> {
  await client.address.updateMany({
    where: { userId, deletedAt: null, isDefault: true },
    data: { isDefault: false },
  });
}

/** Strip the flag; the parts stay as sent (null clears, undefined leaves). */
function toWritableFields(input: Partial<AddressInput>): Prisma.AddressUncheckedUpdateInput {
  const { isDefault: _flag, ...fields } = input;
  return fields;
}

async function createIn(client: Client, userId: number, input: AddressInput): Promise<AddressRow> {
  const existing = await client.address.count({ where: { userId, deletedAt: null } });
  // The first address is the default whether or not the client says so — a
  // user with one address and no default would have nothing to book from.
  const isDefault = existing === 0 || input.isDefault === true;
  if (isDefault && existing > 0) await clearDefault(client, userId);
  return client.address.create({
    data: { ...toWritableFields(input), userId, isDefault } as Prisma.AddressUncheckedCreateInput,
    select: ADDRESS_SELECT,
  });
}

/**
 * Adds an address. Runs in its own transaction unless the caller is already in
 * one (registration creates the user's first address alongside the user row).
 */
export async function createAddress(
  userId: number,
  input: AddressInput,
  tx?: Client,
): Promise<AddressDto> {
  const row = tx ? await createIn(tx, userId, input) : await prisma.$transaction((client) => createIn(client, userId, input));
  return toAddressDto(row);
}

/**
 * Patches one address. `isDefault: true` promotes it (clearing the old
 * default); `isDefault: false` on the current default is refused — the user
 * must promote another one, or there would be nothing to book from.
 */
export async function updateAddress(
  userId: number,
  id: number,
  patch: UpdateAddressRequest,
): Promise<AddressDto> {
  const row = await prisma.$transaction(async (client) => {
    const current = await requireOwned(client, userId, id);
    if (patch.isDefault === false && current.isDefault) {
      throw errors.badRequest('Choose another default address first.');
    }
    const promote = patch.isDefault === true && !current.isDefault;
    if (promote) await clearDefault(client, userId);
    const data: Prisma.AddressUncheckedUpdateInput = {
      ...toWritableFields(patch),
      ...(promote ? { isDefault: true } : {}),
    };
    return client.address.update({ where: { id }, data, select: ADDRESS_SELECT });
  });
  return toAddressDto(row);
}

/** Makes `id` the default and returns the whole list, new default first. */
export async function setDefaultAddress(userId: number, id: number): Promise<AddressDto[]> {
  const rows = await prisma.$transaction(async (client) => {
    const current = await requireOwned(client, userId, id);
    if (!current.isDefault) {
      await clearDefault(client, userId);
      await client.address.update({ where: { id }, data: { isDefault: true }, select: ADDRESS_SELECT });
    }
    return listRows(client, userId);
  });
  return rows.map(toAddressDto);
}

/**
 * Soft-deletes an address. Bookings keep their snapshot and FK, so nothing
 * that already happened moves. If it was the default, the oldest survivor is
 * promoted so the picker still has something to preselect. Deleting the last
 * address is allowed — the booking flow asks for one when there is none.
 */
export async function deleteAddress(userId: number, id: number): Promise<AddressDto[]> {
  const rows = await prisma.$transaction(async (client) => {
    const current = await requireOwned(client, userId, id);
    await client.address.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
    if (current.isDefault) {
      const survivor = await client.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { id: 'asc' },
        select: ADDRESS_SELECT,
      });
      if (survivor) {
        await client.address.update({ where: { id: survivor.id }, data: { isDefault: true } });
      }
    }
    return listRows(client, userId);
  });
  return rows.map(toAddressDto);
}

// ── The signed-in user's own address book (the /addresses routes) ─────────────

/** The current user's row, or a 404 telling the client to finish registration. */
async function requireUser(decoded: DecodedIdToken): Promise<User> {
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user || user.deletedAt) {
    throw errors.notFound('User profile not found. Please complete registration.');
  }
  return user;
}

/**
 * Mothers keep an address book; a nanny's single address is set at registration
 * and thereafter changed only by support (PUT /admin/nannies/:id/address), so
 * she can read it here but not write it.
 */
async function requireMother(decoded: DecodedIdToken): Promise<User> {
  const user = await requireUser(decoded);
  if (user.role !== Role.MOTHER) {
    throw errors.forbidden('Your address is managed by support.');
  }
  return user;
}

export async function listMyAddresses(decoded: DecodedIdToken): Promise<AddressDto[]> {
  const user = await requireUser(decoded);
  return listAddresses(user.id);
}

export async function createMyAddress(
  decoded: DecodedIdToken,
  body: AddressInput,
): Promise<AddressDto> {
  const user = await requireMother(decoded);
  return createAddress(user.id, body);
}

export async function updateMyAddress(
  decoded: DecodedIdToken,
  id: number,
  body: UpdateAddressRequest,
): Promise<AddressDto> {
  const user = await requireMother(decoded);
  return updateAddress(user.id, id, body);
}

export async function setMyDefaultAddress(
  decoded: DecodedIdToken,
  id: number,
): Promise<AddressDto[]> {
  const user = await requireMother(decoded);
  return setDefaultAddress(user.id, id);
}

export async function deleteMyAddress(decoded: DecodedIdToken, id: number): Promise<AddressDto[]> {
  const user = await requireMother(decoded);
  return deleteAddress(user.id, id);
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * Admin path for a nanny, who has exactly one address: rewrite her default in
 * place, or create it as "Home" if she registered without coordinates.
 */
export async function upsertNannyAddress(
  userId: number,
  input: AdminUpsertNannyAddressInput,
): Promise<AddressDto> {
  const row = await prisma.$transaction(async (client) => {
    const current = await getDefaultAddress(userId, client);
    if (current) {
      return client.address.update({
        where: { id: current.id },
        data: toWritableFields(input),
        select: ADDRESS_SELECT,
      });
    }
    return createIn(client, userId, { ...input, label: 'Home', isDefault: true });
  });
  return toAddressDto(row);
}
