/**
 * address.service — the one place a user's location is written.
 *
 * The invariant these tests pin is "exactly one live default per user": the
 * first address becomes the default, making another one the default clears
 * the rest in the same transaction, and deleting the default promotes the
 * oldest survivor. There is no database constraint for it (Prisma cannot
 * declare a partial unique index), so the service is the whole guarantee.
 */

jest.mock('@backend/db/prisma', () => {
  const address = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  return {
    prisma: {
      user: { findUnique: jest.fn() },
      address,
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)({ address })
          : Promise.all(arg as Promise<unknown>[]),
      ),
    },
  };
});

import { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import {
  createAddress,
  createMyAddress,
  deleteAddress,
  listMyAddresses,
  setDefaultAddress,
  toBookingAddressSnapshot,
  updateAddress,
  upsertNannyAddress,
} from '@backend/services/address.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  address: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const USER_ID = 42;

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    userId: USER_ID,
    label: 'Home',
    formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
    governorate: 'Cairo',
    area: 'Maadi',
    street: '12 Road 9',
    building: null,
    floor: null,
    apartment: null,
    landmark: null,
    latitude: new Prisma.Decimal('29.9602000'),
    longitude: new Prisma.Decimal('31.2569000'),
    isDefault: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

const input = {
  label: 'Work',
  formattedAddress: 'Smart Village, Giza',
  governorate: 'Giza',
  area: null,
  street: null,
  building: null,
  floor: null,
  apartment: null,
  landmark: null,
  latitude: 30.07,
  longitude: 31.02,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.address.updateMany.mockResolvedValue({ count: 0 });
});

describe('createAddress', () => {
  it('makes the first address the default even when the flag is not sent', async () => {
    mockPrisma.address.count.mockResolvedValue(0);
    mockPrisma.address.create.mockResolvedValue(row({ id: 7, isDefault: true }));

    const created = await createAddress(USER_ID, input);

    expect(mockPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, isDefault: true }) }),
    );
    expect(created.isDefault).toBe(true);
  });

  it('adds a second address as non-default when the flag is not sent', async () => {
    mockPrisma.address.count.mockResolvedValue(1);
    mockPrisma.address.create.mockResolvedValue(row({ id: 8, isDefault: false }));

    await createAddress(USER_ID, input);

    expect(mockPrisma.address.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: false }) }),
    );
  });

  it('clears the previous default in the same transaction when asked to be the default', async () => {
    mockPrisma.address.count.mockResolvedValue(1);
    mockPrisma.address.create.mockResolvedValue(row({ id: 8, isDefault: true }));

    await createAddress(USER_ID, { ...input, isDefault: true });

    expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, deletedAt: null, isDefault: true },
      data: { isDefault: false },
    });
    expect(mockPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) }),
    );
  });

  it('serialises coordinates as numbers and dates as ISO strings', async () => {
    mockPrisma.address.count.mockResolvedValue(0);
    mockPrisma.address.create.mockResolvedValue(row({ id: 7 }));

    const created = await createAddress(USER_ID, input);

    expect(created).toMatchObject({
      id: 7,
      latitude: 29.9602,
      longitude: 31.2569,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    expect('deletedAt' in created).toBe(false);
  });
});

describe('updateAddress', () => {
  it('404s on an address the user does not own or has deleted', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);

    await expect(updateAddress(USER_ID, 99, { landmark: 'gate 2' })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockPrisma.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, userId: USER_ID, deletedAt: null } }),
    );
  });

  it('writes only the fields sent', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(row({ id: 1 }));
    mockPrisma.address.update.mockResolvedValue(row({ id: 1, landmark: 'gate 2' }));

    await updateAddress(USER_ID, 1, { landmark: 'gate 2' });

    expect(mockPrisma.address.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { landmark: 'gate 2' } }),
    );
  });

  it('refuses to un-default the current default — pick another one instead', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(row({ id: 1, isDefault: true }));

    await expect(updateAddress(USER_ID, 1, { isDefault: false })).rejects.toBeInstanceOf(AppError);
    expect(mockPrisma.address.update).not.toHaveBeenCalled();
  });

  it('promoting an address clears the previous default first', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(row({ id: 2, isDefault: false }));
    mockPrisma.address.update.mockResolvedValue(row({ id: 2, isDefault: true }));

    await updateAddress(USER_ID, 2, { isDefault: true });

    expect(mockPrisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, deletedAt: null, isDefault: true },
      data: { isDefault: false },
    });
    expect(mockPrisma.address.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { isDefault: true } }),
    );
  });
});

describe('setDefaultAddress', () => {
  it('clears the others and returns the list with the new default first', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(row({ id: 2, isDefault: false }));
    mockPrisma.address.update.mockResolvedValue(row({ id: 2, isDefault: true }));
    mockPrisma.address.findMany.mockResolvedValue([
      row({ id: 2, isDefault: true }),
      row({ id: 1, isDefault: false }),
    ]);

    const list = await setDefaultAddress(USER_ID, 2);

    expect(mockPrisma.address.updateMany).toHaveBeenCalledTimes(1);
    expect(list.map((a) => [a.id, a.isDefault])).toEqual([
      [2, true],
      [1, false],
    ]);
  });
});

describe('deleteAddress', () => {
  it('soft-deletes and promotes the oldest survivor when the default goes', async () => {
    mockPrisma.address.findFirst
      .mockResolvedValueOnce(row({ id: 1, isDefault: true })) // the one being deleted
      .mockResolvedValueOnce(row({ id: 3, isDefault: false })); // oldest survivor
    mockPrisma.address.update.mockResolvedValue(row());
    mockPrisma.address.findMany.mockResolvedValue([row({ id: 3, isDefault: true })]);

    await deleteAddress(USER_ID, 1);

    expect(mockPrisma.address.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { deletedAt: expect.any(Date), isDefault: false },
    });
    expect(mockPrisma.address.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: USER_ID, deletedAt: null },
        orderBy: { id: 'asc' },
      }),
    );
    expect(mockPrisma.address.update).toHaveBeenNthCalledWith(2, {
      where: { id: 3 },
      data: { isDefault: true },
    });
  });

  it('leaves the default alone when a non-default address goes', async () => {
    mockPrisma.address.findFirst.mockResolvedValueOnce(row({ id: 2, isDefault: false }));
    mockPrisma.address.update.mockResolvedValue(row());
    mockPrisma.address.findMany.mockResolvedValue([row({ id: 1 })]);

    await deleteAddress(USER_ID, 2);

    expect(mockPrisma.address.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.address.update).toHaveBeenCalledTimes(1);
  });

  it('404s on an address that is not the user’s', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);
    await expect(deleteAddress(USER_ID, 5)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('upsertNannyAddress', () => {
  const nannyInput = { ...input, label: undefined };

  it('rewrites her existing default in place', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(row({ id: 4, label: 'Home' }));
    mockPrisma.address.update.mockResolvedValue(row({ id: 4, formattedAddress: input.formattedAddress }));

    const saved = await upsertNannyAddress(USER_ID, nannyInput);

    expect(mockPrisma.address.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 4 },
        data: expect.objectContaining({ formattedAddress: input.formattedAddress, latitude: 30.07 }),
      }),
    );
    expect(mockPrisma.address.create).not.toHaveBeenCalled();
    expect(saved.id).toBe(4);
  });

  it('creates a default "Home" when she has none', async () => {
    mockPrisma.address.findFirst.mockResolvedValue(null);
    mockPrisma.address.count.mockResolvedValue(0);
    mockPrisma.address.create.mockResolvedValue(row({ id: 5 }));

    await upsertNannyAddress(USER_ID, nannyInput);

    expect(mockPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID, label: 'Home', isDefault: true }),
      }),
    );
  });
});

describe('the signed-in user’s own addresses', () => {
  const decoded = { uid: 'firebase-uid' } as never;

  it('lets a nanny read her address but not write one — support edits it', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'NANNY', deletedAt: null });
    mockPrisma.address.findMany.mockResolvedValue([row()]);

    await expect(listMyAddresses(decoded)).resolves.toHaveLength(1);
    await expect(createMyAddress(decoded, input)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.address.create).not.toHaveBeenCalled();
  });

  it('lets a mother add to her address book', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID, role: 'MOTHER', deletedAt: null });
    mockPrisma.address.count.mockResolvedValue(0);
    mockPrisma.address.create.mockResolvedValue(row({ id: 7 }));

    const created = await createMyAddress(decoded, input);

    expect(created.id).toBe(7);
    expect(mockPrisma.address.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID }) }),
    );
  });

  it('404s a signed-in Firebase user with no application row', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(listMyAddresses(decoded)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('toBookingAddressSnapshot', () => {
  it('copies every field plus the source id, with numeric coordinates', () => {
    const snap = toBookingAddressSnapshot(row({ id: 9, landmark: 'gate 2' }));
    expect(snap).toEqual({
      addressId: 9,
      label: 'Home',
      formattedAddress: '12 Rd 9, Maadi, Cairo Governorate, Egypt',
      governorate: 'Cairo',
      area: 'Maadi',
      street: '12 Road 9',
      building: null,
      floor: null,
      apartment: null,
      landmark: 'gate 2',
      latitude: 29.9602,
      longitude: 31.2569,
    });
  });
});
