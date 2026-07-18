jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

// admin-user.service imports firebaseAuth (→ config env validation) at module load;
// mock it so the mother-directory tests stay hermetic and don't need real env vars.
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { createUser: jest.fn() },
}));

import { AppError } from '@backend/lib/errors';
import { prisma } from '@backend/db/prisma';
import {
  getAdminMother,
  listAdminMothers,
  updateAdminMother,
} from '@backend/services/admin-user.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; update: jest.Mock };
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    firstName: 'Nour',
    lastName: 'Ibrahim',
    email: 'nour@example.com',
    phone: '+201000000000',
    avatarUrl: null,
    address: 'Cairo',
    isEmailVerified: true,
    isPhoneVerified: false,
    isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    _count: { bookingsAsMother: 3 },
    ...overrides,
  };
}

describe('listAdminMothers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries only mother accounts, newest first, applying skip/take', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { meta } = await listAdminMothers({ page: 2, limit: 25 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'MOTHER', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: 25,
        take: 25,
      }),
    );
    expect(meta).toEqual({ page: 2, limit: 25, total: 1, totalPages: 1 });
  });

  it('maps rows to the AdminMother DTO', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const { mothers } = await listAdminMothers({ page: 1, limit: 20 });

    expect(mothers[0]).toEqual({
      id: 'user-1',
      name: 'Nour Ibrahim',
      email: 'nour@example.com',
      phone: '+201000000000',
      avatarUrl: null,
      location: 'Cairo',
      isEmailVerified: true,
      isPhoneVerified: false,
      isActive: true,
      bookingCount: 3,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
  });

  it('drops the "-" placeholder last name from the display name', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const { mothers } = await listAdminMothers({ page: 1, limit: 20 });

    expect(mothers[0]?.name).toBe('Mona');
  });
});

describe('getAdminMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the mother DTO for an existing account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());

    const mother = await getAdminMother('user-1');

    expect(mother.id).toBe('user-1');
    expect(mother.name).toBe('Nour Ibrahim');
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1', role: 'MOTHER', deletedAt: null },
      }),
    );
  });

  it('includes the raw first/last name split for the edit form', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());

    const mother = await getAdminMother('user-1');

    expect(mother.firstName).toBe('Nour');
    expect(mother.lastName).toBe('Ibrahim');
  });

  it('throws when the mother does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(getAdminMother('missing')).rejects.toThrow(AppError);
  });
});

describe('updateAdminMother', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the provided fields and returns the detail DTO', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());
    mockPrisma.user.update.mockResolvedValue(
      makeRow({ firstName: 'Salma', lastName: 'Adel', isActive: false }),
    );

    const result = await updateAdminMother('user-1', {
      firstName: 'Salma',
      lastName: 'Adel',
      isActive: false,
    });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1', role: 'MOTHER', deletedAt: null } }),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { firstName: 'Salma', lastName: 'Adel', isActive: false },
      }),
    );
    expect(result).toMatchObject({
      name: 'Salma Adel',
      firstName: 'Salma',
      lastName: 'Adel',
      isActive: false,
    });
  });

  it('stores an empty last name as the "-" placeholder', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());
    mockPrisma.user.update.mockResolvedValue(makeRow({ lastName: '-' }));

    await updateAdminMother('user-1', { lastName: '' });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { lastName: '-' } }),
    );
  });

  it('writes only the fields that were provided', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(makeRow());
    mockPrisma.user.update.mockResolvedValue(makeRow({ isActive: false }));

    await updateAdminMother('user-1', { isActive: false });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: { isActive: false } }),
    );
  });

  it('throws and does not write when the mother does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(updateAdminMother('missing', { isActive: false })).rejects.toThrow(AppError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
