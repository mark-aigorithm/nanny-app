/**
 * `lastLoginAt` is the time of her last real sign-in: GET /auth/me writes the
 * token's `auth_time`, and only when it is later than what is stored. A
 * refetch from an old session (a token refreshed from a sign-in we already
 * recorded) writes nothing, and nothing ever moves it backwards. App opens
 * are recorded elsewhere (POST /me/app-open).
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { getUser: jest.fn() },
}));

jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

import { Role } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { getMe } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
};

// 2026-10-20T10:00:00.000Z in seconds, as Firebase puts it in the token.
const AUTH_TIME = Date.UTC(2026, 9, 20, 10, 0, 0) / 1000;
const SIGNED_IN = new Date(AUTH_TIME * 1000);

function decoded(authTime?: number) {
  return { uid: 'fb-1', ...(authTime === undefined ? {} : { auth_time: authTime }) } as never;
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    firebaseUid: 'fb-1',
    email: 'layla@example.com',
    phone: '+201004455667',
    firstName: 'Layla',
    lastName: 'Mostafa',
    dateOfBirth: null,
    avatarUrl: null,
    role: Role.MOTHER,
    isEmailVerified: true,
    isPhoneVerified: true,
    approvalStatus: 'APPROVED',
    idDocumentType: null,
    rejectionReason: null,
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(userRow(data)),
  );
});

describe('getMe — lastLoginAt is the last real sign-in', () => {
  it('writes auth_time when nothing is stored yet', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: null }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { lastLoginAt: SIGNED_IN } });
  });

  it('moves it forward to a newer sign-in', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: new Date(SIGNED_IN.getTime() - 86_400_000) }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 55 }, data: { lastLoginAt: SIGNED_IN } });
  });

  it('writes nothing when the token is from the sign-in already recorded', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: SIGNED_IN }));

    await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('never moves it backwards for a token from an older session', async () => {
    const later = new Date(SIGNED_IN.getTime() + 3_600_000);
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: later }));

    const me = await getMe(decoded(AUTH_TIME));

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(me.id).toBe(55);
  });

  it('writes nothing when the token carries no auth_time', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow({ lastLoginAt: null }));

    await getMe(decoded());

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
