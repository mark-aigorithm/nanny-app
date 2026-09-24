/**
 * getMe re-attaching a row whose Firebase account was deleted.
 *
 * A row's `firebaseUid` can go stale when the owner's Firebase account is
 * deleted and re-created (e.g. account recovery): the new sign-in mints a
 * fresh uid that no row points at, so the plain `findUnique` lookup in
 * `getMe`/`requireUser` finds nothing and would 404 forever. This exercises
 * the fallback (`reattachOrphanedRow`, internal — reached only through the
 * exported `getMe`) that re-points the row once the new token proves the
 * row's phone (or verified email) and the old uid is confirmed gone.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
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
import { firebaseAuth } from '@backend/lib/firebase';
import { getMe } from '@backend/services/auth.service';

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockFindMany = prisma.user.findMany as jest.Mock;
const mockFindFirst = prisma.user.findFirst as jest.Mock;
const mockUpdate = prisma.user.update as jest.Mock;
const mockUpdateMany = prisma.user.updateMany as jest.Mock;
const mockGetUser = firebaseAuth.getUser as jest.Mock;

function userNotFound(): Error {
  return Object.assign(new Error('There is no user record...'), { code: 'auth/user-not-found' });
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firebaseUid: 'old-uid',
    email: 'layla@example.com',
    phone: '+201000000000',
    firstName: 'Layla',
    lastName: 'Mostafa',
    dateOfBirth: new Date('1990-01-01'),
    avatarUrl: null,
    role: Role.MOTHER,
    isEmailVerified: true,
    isPhoneVerified: true,
    approvalStatus: 'APPROVED',
    idDocumentType: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const NOT_FOUND_MESSAGE = 'User profile not found. Please complete registration.';

beforeEach(() => {
  jest.clearAllMocks();
  // No row for the new uid — every case here is the "orphaned owner" state.
  mockFindUnique.mockResolvedValue(null);
});

describe('getMe — re-attaching an orphaned row', () => {
  it('404s without querying for candidates when the token carries no phone and no email', async () => {
    const decoded = { uid: 'fb-new' } as never;

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404, message: NOT_FOUND_MESSAGE });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('404s without querying for candidates when the email is unverified and there is no phone', async () => {
    const decoded = { uid: 'fb-new', email: 'layla@example.com', email_verified: false } as never;

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404, message: NOT_FOUND_MESSAGE });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('404s when more than one live row matches', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    mockFindMany.mockResolvedValue([userRow({ id: 1 }), userRow({ id: 2 })]);

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404, message: NOT_FOUND_MESSAGE });
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('404s when the matched row\'s old Firebase account still exists — not an orphan', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    mockFindMany.mockResolvedValue([userRow({ firebaseUid: 'old-uid' })]);
    mockGetUser.mockResolvedValue({ uid: 'old-uid' });

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404, message: NOT_FOUND_MESSAGE });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('rethrows a Firebase error other than user-not-found (the 500 path), and re-points nothing', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    mockFindMany.mockResolvedValue([userRow({ firebaseUid: 'old-uid' })]);
    mockGetUser.mockRejectedValue(new Error('firebase down'));

    await expect(getMe(decoded)).rejects.toThrow('firebase down');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('404s without re-pointing anything when the uid\'s own row is soft-deleted (firebaseUid is unique)', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    mockFindUnique.mockResolvedValue(userRow({ firebaseUid: 'fb-new', deletedAt: new Date() }));

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404, message: NOT_FOUND_MESSAGE });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('never considers ADMIN rows — the findMany call filters role to MOTHER/NANNY', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    mockFindMany.mockResolvedValue([]);

    await expect(getMe(decoded)).rejects.toMatchObject({ statusCode: 404 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: { in: [Role.MOTHER, Role.NANNY] } }),
      }),
    );
  });

  it('re-points the row onto the new uid when the old Firebase account is truly gone', async () => {
    const decoded = { uid: 'fb-new', phone_number: '+201000000000' } as never;
    const orphan = userRow({ id: 42, firebaseUid: 'old-uid' });
    mockFindMany.mockResolvedValue([orphan]);
    mockGetUser.mockRejectedValue(userNotFound());
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const reattached = userRow({ id: 42, firebaseUid: 'fb-new' });
    mockFindFirst.mockResolvedValue(reattached);
    mockUpdate.mockResolvedValue(reattached);

    const result = await getMe(decoded);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 42, firebaseUid: 'old-uid', deletedAt: null },
      data: { firebaseUid: 'fb-new' },
    });
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { firebaseUid: 'fb-new', deletedAt: null } });
    expect(result.id).toBe(42);
    expect(result.firebaseUid).toBe('fb-new');
  });

  it('matches on a verified email too', async () => {
    const decoded = { uid: 'fb-new', email: 'Layla@Example.com', email_verified: true } as never;
    const orphan = userRow({ id: 7, firebaseUid: 'old-uid', email: 'layla@example.com' });
    mockFindMany.mockResolvedValue([orphan]);
    mockGetUser.mockRejectedValue(userNotFound());
    mockUpdateMany.mockResolvedValue({ count: 1 });
    const reattached = userRow({ id: 7, firebaseUid: 'fb-new', email: 'layla@example.com' });
    mockFindFirst.mockResolvedValue(reattached);
    mockUpdate.mockResolvedValue(reattached);

    const result = await getMe(decoded);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ email: 'layla@example.com' }] }) }),
    );
    expect(result.id).toBe(7);
  });
});
