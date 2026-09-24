/**
 * reclaimEmail — how a row-less (unfinished) sign-up takes over an email
 * another unfinished sign-up is squatting, so its owner isn't blocked by a
 * Firebase identity holding an address they can no longer prove. (Discarding
 * the caller's own unfinished account is covered in
 * account-deletion.service.test.ts.)
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findFirst: jest.fn() } },
}));
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { deleteUser: jest.fn(), getUserByEmail: jest.fn() },
}));
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));
jest.mock('@backend/services/email-verification.service', () => ({
  assertVerificationTokenIsValid: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { reclaimEmail } from '@backend/services/unfinished-account.service';
import { assertVerificationTokenIsValid } from '@backend/services/email-verification.service';

const mockFindFirst = prisma.user.findFirst as jest.Mock;
const mockDeleteUser = firebaseAuth.deleteUser as jest.Mock;
const mockGetUserByEmail = firebaseAuth.getUserByEmail as jest.Mock;
const mockAssertToken = assertVerificationTokenIsValid as jest.Mock;

const DECODED = { uid: 'fb-caller' } as never;
const EMAIL = 'layla@example.com';
const TOKEN = 'a'.repeat(32);

function userNotFound(): Error {
  return Object.assign(new Error('There is no user record...'), { code: 'auth/user-not-found' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockDeleteUser.mockResolvedValue(undefined);
  mockAssertToken.mockResolvedValue(undefined);
});

describe('reclaimEmail', () => {
  it('rethrows an invalid token and deletes nothing', async () => {
    mockAssertToken.mockRejectedValueOnce(
      Object.assign(new Error('Your email verification has expired.'), { statusCode: 400 }),
    );

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses when the caller already has a row', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 1 });

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists. Sign in instead.',
    });
    expect(mockGetUserByEmail).not.toHaveBeenCalled();
  });

  it('resolves with no delete when the holder is not found', async () => {
    mockGetUserByEmail.mockRejectedValueOnce(userNotFound());

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).resolves.toBeUndefined();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('does nothing when the holder is the caller', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb-caller', disabled: false });

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).resolves.toBeUndefined();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses a disabled holder', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb-holder', disabled: true });

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists. Sign in instead.',
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses a holder who has a row, even soft-deleted', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb-holder', disabled: false });
    mockFindFirst
      .mockResolvedValueOnce(null) // caller has no row
      .mockResolvedValueOnce({ id: 2 }); // holder does (soft-deleted or not)

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists. Sign in instead.',
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('refuses when a live row already holds the email under a different uid', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb-holder', disabled: false });
    mockFindFirst
      .mockResolvedValueOnce(null) // caller has no row
      .mockResolvedValueOnce(null) // holder has no row
      .mockResolvedValueOnce({ id: 3 }); // a live row holds the email

    await expect(reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN })).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists. Sign in instead.',
    });
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('deletes the holder once on the happy path', async () => {
    mockGetUserByEmail.mockResolvedValueOnce({ uid: 'fb-holder', disabled: false });
    mockFindFirst
      .mockResolvedValueOnce(null) // caller has no row
      .mockResolvedValueOnce(null) // holder has no row
      .mockResolvedValueOnce(null); // no live row holds the email

    await reclaimEmail(DECODED, { email: EMAIL, emailVerificationToken: TOKEN });

    expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    expect(mockDeleteUser).toHaveBeenCalledWith('fb-holder');
  });
});
