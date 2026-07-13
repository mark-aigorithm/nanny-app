jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@backend/db/prisma';
import { listAdminMothers } from '@backend/services/admin-user.service';

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
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

  it('queries only active mother accounts, newest first', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    await listAdminMothers();

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'MOTHER', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('maps rows to the AdminMother DTO', async () => {
    mockPrisma.user.findMany.mockResolvedValue([makeRow()]);

    const [mother] = await listAdminMothers();

    expect(mother).toEqual({
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
    mockPrisma.user.findMany.mockResolvedValue([makeRow({ firstName: 'Mona', lastName: '-' })]);

    const [mother] = await listAdminMothers();

    expect(mother?.name).toBe('Mona');
  });
});
