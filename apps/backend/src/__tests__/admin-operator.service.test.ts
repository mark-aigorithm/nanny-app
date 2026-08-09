jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { createUser: jest.fn(), updateUser: jest.fn() },
}));

jest.mock('@backend/lib/storage', () => ({
  deleteStorageObjectByUrl: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn().mockResolvedValue(undefined),
  dispatchPush: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { AppError } from '@backend/lib/errors';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  listConsoleUserIdsForSection,
  updateAdminUser,
} from '@backend/services/admin-user.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
};
const mockFirebase = firebaseAuth as unknown as {
  createUser: jest.Mock;
  updateUser: jest.Mock;
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firstName: 'Nour',
    lastName: 'Hassan',
    email: 'nour@nannynow.com',
    role: 'OPERATOR',
    adminPermissions: { bookings: 'VIEW', marketplace: 'MANAGE' },
    isActive: true,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createAdminUser', () => {
  beforeEach(() => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockFirebase.createUser.mockResolvedValue({ uid: 'firebase-uid-1' });
  });

  it('stores the granted sections on an operator', async () => {
    mockPrisma.user.create.mockResolvedValue(row());

    const result = await createAdminUser({
      name: 'Nour Hassan',
      email: 'Nour@NannyNow.com',
      password: 'longenoughpassword',
      role: 'OPERATOR',
      permissions: { bookings: 'VIEW', marketplace: 'MANAGE' },
    });

    const data = mockPrisma.user.create.mock.calls[0]?.[0]?.data;
    expect(data.role).toBe('OPERATOR');
    expect(data.adminPermissions).toEqual({ bookings: 'VIEW', marketplace: 'MANAGE' });
    // Email is normalised before both the Firebase and the row write.
    expect(data.email).toBe('nour@nannynow.com');
    expect(result.permissions).toEqual({ bookings: 'VIEW', marketplace: 'MANAGE' });
  });

  it('stores nothing for a full admin — their reach comes from the role', async () => {
    mockPrisma.user.create.mockResolvedValue(row({ role: 'ADMIN', adminPermissions: null }));

    const result = await createAdminUser({
      name: 'Mona Adel',
      email: 'mona@nannynow.com',
      password: 'longenoughpassword',
      role: 'ADMIN',
      permissions: {},
    });

    expect(mockPrisma.user.create.mock.calls[0]?.[0]?.data.adminPermissions).toBeUndefined();
    // …but the API still reports full access, so the console gates on one field.
    expect(result.permissions.bookings).toBe('MANAGE');
    expect(result.permissions.pricing).toBe('MANAGE');
  });

  it('refuses an email that is already taken', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 3 });

    await expect(
      createAdminUser({
        name: 'Nour Hassan',
        email: 'nour@nannynow.com',
        password: 'longenoughpassword',
        role: 'OPERATOR',
        permissions: { bookings: 'VIEW' },
      }),
    ).rejects.toThrow(AppError);
    expect(mockFirebase.createUser).not.toHaveBeenCalled();
  });
});

describe('updateAdminUser', () => {
  it('re-scopes an operator', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row());
    mockPrisma.user.update.mockResolvedValue(row({ adminPermissions: { pricing: 'MANAGE' } }));

    const result = await updateAdminUser(7, { permissions: { pricing: 'MANAGE' } });

    expect(mockPrisma.user.update.mock.calls[0]?.[0]?.data.adminPermissions).toEqual({
      pricing: 'MANAGE',
    });
    expect(result.permissions).toEqual({ pricing: 'MANAGE' });
  });

  it('ignores a permission map sent for a full admin', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row({ role: 'ADMIN', adminPermissions: null }));
    mockPrisma.user.update.mockResolvedValue(row({ role: 'ADMIN', adminPermissions: null }));

    await updateAdminUser(7, { permissions: { pricing: 'VIEW' } });

    expect(mockPrisma.user.update.mock.calls[0]?.[0]?.data.adminPermissions).toBeUndefined();
  });

  it('splits a new name into first and last', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row());
    mockPrisma.user.update.mockResolvedValue(row());

    await updateAdminUser(7, { name: 'Nour  Adel Hassan' });

    const data = mockPrisma.user.update.mock.calls[0]?.[0]?.data;
    expect(data.firstName).toBe('Nour');
    expect(data.lastName).toBe('Adel Hassan');
  });

  it('refuses to touch the superuser', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row({ role: 'SUPERUSER' }));

    await expect(updateAdminUser(1, { isActive: false })).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('404s on an account that does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(updateAdminUser(99, { isActive: false })).rejects.toThrow(AppError);
  });
});

describe('deleteAdminUser', () => {
  it('soft-deletes and disables the Firebase account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row());
    mockPrisma.user.update.mockResolvedValue({ firebaseUid: 'firebase-uid-1' });

    await deleteAdminUser(7, 1);

    const data = mockPrisma.user.update.mock.calls[0]?.[0]?.data;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.isActive).toBe(false);
    // Disabling matters: a valid token would otherwise keep working until it expires.
    expect(mockFirebase.updateUser).toHaveBeenCalledWith('firebase-uid-1', { disabled: true });
  });

  it('refuses to remove the acting account', async () => {
    await expect(deleteAdminUser(7, 7)).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to remove the superuser', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(row({ role: 'SUPERUSER' }));

    await expect(deleteAdminUser(1, 7)).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('listAdminUsers', () => {
  it('includes operators alongside admins', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      row({ id: 1, role: 'SUPERUSER', adminPermissions: null }),
      row({ id: 2, role: 'ADMIN', adminPermissions: null }),
      row({ id: 3, role: 'OPERATOR' }),
    ]);

    const result = await listAdminUsers();

    expect(mockPrisma.user.findMany.mock.calls[0]?.[0]?.where.role.in).toEqual(
      expect.arrayContaining(['ADMIN', 'SUPERUSER', 'OPERATOR']),
    );
    expect(result.map((admin) => admin.role)).toEqual(['SUPERUSER', 'ADMIN', 'OPERATOR']);
  });
});

describe('listConsoleUserIdsForSection', () => {
  it('notifies only the accounts that can open the section', async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 1, role: 'SUPERUSER', adminPermissions: null },
      { id: 2, role: 'ADMIN', adminPermissions: null },
      { id: 3, role: 'OPERATOR', adminPermissions: { bookings: 'VIEW' } },
      { id: 4, role: 'OPERATOR', adminPermissions: { marketplace: 'MANAGE' } },
      { id: 5, role: 'OPERATOR', adminPermissions: null },
    ]);

    await expect(listConsoleUserIdsForSection('bookings')).resolves.toEqual([1, 2, 3]);
  });
});
