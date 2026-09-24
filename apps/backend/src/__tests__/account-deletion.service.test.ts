/**
 * deleteMe — DELETE /auth/me. With no `users` row it discards an unfinished
 * sign-up (the Firebase user only); with a live MOTHER/NANNY row and the
 * explicit confirm it soft-deletes the row with its identity scrambled, then
 * deletes the Firebase user.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findFirst: jest.fn() }, $transaction: jest.fn() },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { deleteUser: jest.fn(), getUser: jest.fn() },
}));
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { deleteMe, scrambleIdentity } from '@backend/services/account-deletion.service';

const mockFindFirst = prisma.user.findFirst as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockDeleteUser = firebaseAuth.deleteUser as jest.Mock;
const mockGetUser = firebaseAuth.getUser as jest.Mock;

const tx = {
  booking: { count: jest.fn() },
  user: { update: jest.fn() },
  nannyProfile: { update: jest.fn() },
  deviceToken: { updateMany: jest.fn() },
};

const DECODED = { uid: 'fb-caller' } as never;
const CONFIRM = { confirm: 'delete-my-account' } as const;
const MOTHER_ROW = { id: 7, role: 'MOTHER', deletedAt: null, nannyProfile: null };
const NANNY_ROW = { id: 8, role: 'NANNY', deletedAt: null, nannyProfile: { id: 42 } };
const CANT_REMOVE = "This account can't be removed here.";
const BOOKINGS = 'Finish or cancel your upcoming bookings before deleting your account.';

function userNotFound(): Error {
  return Object.assign(new Error('There is no user record...'), { code: 'auth/user-not-found' });
}

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockDeleteUser.mockResolvedValue(undefined);
  mockGetUser.mockResolvedValue({ providerData: [{ providerId: 'phone' }] });
  mockTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  tx.booking.count.mockResolvedValue(0);
  tx.user.update.mockResolvedValue({});
  tx.nannyProfile.update.mockResolvedValue({});
  tx.deviceToken.updateMany.mockResolvedValue({ count: 1 });
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('scrambleIdentity', () => {
  it('gives distinct, unreachable values on every call and frees the phone', () => {
    const a = scrambleIdentity(7);
    const b = scrambleIdentity(7);

    expect(a.email).toMatch(/^deleted-7-.+@deleted\.nannyapp\.invalid$/);
    expect(a.firebaseUid).toMatch(/^deleted:7:.+/);
    expect(a.phone).toBeNull();
    expect(a.email).not.toBe(b.email);
    expect(a.firebaseUid).not.toBe(b.firebaseUid);
  });
});

describe('deleteMe — no row (unfinished sign-up)', () => {
  it('deletes the Firebase account and touches no row', async () => {
    await deleteMe(DECODED, {});

    expect(mockDeleteUser).toHaveBeenCalledWith('fb-caller');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('looks the row up with no deletedAt filter', async () => {
    await deleteMe(DECODED, {});

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { firebaseUid: 'fb-caller' } }),
    );
  });

  it('treats auth/user-not-found as success', async () => {
    mockDeleteUser.mockRejectedValueOnce(userNotFound());

    await expect(deleteMe(DECODED, {})).resolves.toBeUndefined();
  });

  it('rethrows any other Firebase error', async () => {
    mockDeleteUser.mockRejectedValueOnce(new Error('firebase down'));

    await expect(deleteMe(DECODED, {})).rejects.toThrow('firebase down');
  });
});

describe('deleteMe — refusals', () => {
  it('refuses a soft-deleted row (409), even with confirm', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...MOTHER_ROW, deletedAt: new Date() });

    await expect(deleteMe(DECODED, CONFIRM)).rejects.toMatchObject({ statusCode: 409, message: CANT_REMOVE });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses a live row without the confirm (409) and updates nothing', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);

    await expect(deleteMe(DECODED, {})).rejects.toMatchObject({ statusCode: 409, message: CANT_REMOVE });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'OPERATOR', 'SUPERUSER'])('refuses a %s (403)', async (role) => {
    mockFindFirst.mockResolvedValueOnce({ ...MOTHER_ROW, role });

    await expect(deleteMe(DECODED, CONFIRM)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Staff accounts are removed from the admin console.',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses a mother with an active booking (409) and updates nothing', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);
    tx.booking.count.mockResolvedValueOnce(1);

    await expect(deleteMe(DECODED, CONFIRM)).rejects.toMatchObject({ statusCode: 409, message: BOOKINGS });
    expect(tx.booking.count).toHaveBeenCalledWith({
      where: {
        // A soft-deleted booking is gone — it must not hold the account hostage.
        deletedAt: null,
        status: { in: ['PENDING', 'APPROVED', 'PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PROGRESS'] },
        OR: [{ motherId: 7 }],
      },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses a nanny with an active booking on her profile (409)', async () => {
    mockFindFirst.mockResolvedValueOnce(NANNY_ROW);
    tx.booking.count.mockResolvedValueOnce(2);

    await expect(deleteMe(DECODED, CONFIRM)).rejects.toMatchObject({ statusCode: 409, message: BOOKINGS });
    expect(tx.booking.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ OR: [{ motherId: 8 }, { nannyProfileId: 42 }] }),
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.nannyProfile.update).not.toHaveBeenCalled();
  });
});

describe('deleteMe — deletion', () => {
  it('scrambles and soft-deletes the row, its profile and tokens, then deletes the Firebase user', async () => {
    mockFindFirst.mockResolvedValueOnce(NANNY_ROW);
    const order: string[] = [];
    mockTransaction.mockImplementationOnce(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      order.push('commit');
      return result;
    });
    mockDeleteUser.mockImplementationOnce(async () => {
      order.push('deleteUser');
    });

    await deleteMe(DECODED, CONFIRM);

    expect(tx.user.update).toHaveBeenCalledTimes(1);
    const { where, data } = tx.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 8 });
    expect(data).toMatchObject({
      email: expect.stringMatching(/@deleted\.nannyapp\.invalid$/),
      phone: null,
      firebaseUid: expect.stringMatching(/^deleted:8:/),
      deletedAt: expect.any(Date),
      deletionRequestedAt: expect.any(Date),
      isActive: false,
    });
    expect(tx.nannyProfile.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { deletedAt: data.deletedAt },
    });
    expect(tx.deviceToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 8, deletedAt: null },
      data: { deletedAt: data.deletedAt },
    });
    expect(mockDeleteUser).toHaveBeenCalledWith('fb-caller');
    expect(order).toEqual(['commit', 'deleteUser']);
  });

  it('does not touch a nanny profile for a mother', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);

    await deleteMe(DECODED, CONFIRM);

    expect(tx.nannyProfile.update).not.toHaveBeenCalled();
    expect(tx.deviceToken.updateMany).toHaveBeenCalled();
  });

  it('treats auth/user-not-found after the commit as success', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);
    mockDeleteUser.mockRejectedValueOnce(userNotFound());

    await expect(deleteMe(DECODED, CONFIRM)).resolves.toBeUndefined();
  });

  it('rethrows any other Firebase error after the DB commit', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);
    mockDeleteUser.mockRejectedValueOnce(new Error('firebase down'));

    await expect(deleteMe(DECODED, CONFIRM)).rejects.toThrow('firebase down');
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it('audits with appleLinked and appleRevoked', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);
    mockGetUser.mockResolvedValueOnce({ providerData: [{ providerId: 'apple.com' }] });

    await deleteMe(DECODED, { ...CONFIRM, appleRevoked: true });

    expect(mockGetUser).toHaveBeenCalledWith('fb-caller');
    expect(warnSpy).toHaveBeenCalledWith('[auth] account deleted', {
      userId: 7,
      role: 'MOTHER',
      appleLinked: true,
      appleRevoked: true,
    });
  });

  it('audits appleRevoked false when the client did not say so', async () => {
    mockFindFirst.mockResolvedValueOnce(MOTHER_ROW);

    await deleteMe(DECODED, CONFIRM);

    expect(warnSpy).toHaveBeenCalledWith('[auth] account deleted', {
      userId: 7,
      role: 'MOTHER',
      appleLinked: false,
      appleRevoked: false,
    });
  });
});
