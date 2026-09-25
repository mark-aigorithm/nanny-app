/**
 * `checkAvailability` answers step 1 of the wizard: is this email or phone
 * already somebody's? It must give the same answer `registerUser` gives at the
 * end, so both are exercised here against one `findUnique` mock.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));

// Without this, the real lib/firebase.ts (imported transitively via
// auth.service) would run its module-level admin.initializeApp() against the
// mocked config above, which has no clientEmail/privateKey — the same
// hermeticity gap the other four config-mocked test files close by already
// mocking this module.
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn(), getUserByPhoneNumber: jest.fn() },
}));

jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/admin-nanny.service', () => ({
  reconcileNannySkills: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
}));

import { Role, type RegisterRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { AppError } from '@backend/lib/errors';
import { firebaseAuth } from '@backend/lib/firebase';
import { checkAvailability, phoneHasAccount, registerUser } from '@backend/services/auth.service';
import { storageUrl } from '../../test/storage-url';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const TAKEN_EMAIL = 'taken@example.com';
const TAKEN_PHONE = '+201000000001';
const FREE_EMAIL = 'free@example.com';
const FREE_PHONE = '+201000000002';

// MOTHER_BODY (and its per-test overrides below) carries an
// emailVerificationToken, which must be for the address the decoded token's
// account signs in with — so each decoded fixture's email lines up with
// whatever email that test registers.
/** A fresh Firebase uid — no existing row for it, so registration proceeds to the collision checks. */
const DECODED = { uid: 'fb-new', email: FREE_EMAIL, phone_number: FREE_PHONE } as never;
/** She verified a number that already belongs to an account. */
const DECODED_TAKEN_PHONE = { uid: 'fb-new', email: FREE_EMAIL, phone_number: TAKEN_PHONE } as never;
/** She verified an email that already belongs to an account. */
const DECODED_TAKEN_EMAIL = { uid: 'fb-new', email: TAKEN_EMAIL, phone_number: FREE_PHONE } as never;
/** Both the email and the phone being registered already belong to accounts. */
const DECODED_BOTH_TAKEN = { uid: 'fb-new', email: TAKEN_EMAIL, phone_number: TAKEN_PHONE } as never;

const MOTHER_BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: FREE_EMAIL,
  phone: FREE_PHONE,
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: 'v1.0',
  address: '1 Test Street, Cairo',
  latitude: 30.05,
  longitude: 31.23,
  emailVerificationToken: 'b'.repeat(64),
  // Every DECODED token in this file carries uid 'fb-new' (a fresh account,
  // pre-collision-check) — the upload must be that account's own.
  avatarUrl: storageUrl('avatars', 'fb-new'),
};

/**
 * Answer `findUnique` the way the DB would: a row for the taken email, a row
 * for the taken phone, nothing for anything else (including the new uid).
 */
function seedOwners() {
  mockPrisma.user.findUnique.mockImplementation(
    ({ where }: { where: { email?: string; phone?: string; firebaseUid?: string } }) => {
      if (where.email === TAKEN_EMAIL) return Promise.resolve({ id: 1, email: TAKEN_EMAIL });
      if (where.phone === TAKEN_PHONE) return Promise.resolve({ id: 2, phone: TAKEN_PHONE });
      return Promise.resolve(null);
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  seedOwners();
});

describe('checkAvailability', () => {
  it('reports both free', async () => {
    await expect(checkAvailability({ email: FREE_EMAIL, phone: FREE_PHONE })).resolves.toEqual({
      emailTaken: false,
      phoneTaken: false,
    });
  });

  it('reports a taken email on its own', async () => {
    await expect(checkAvailability({ email: TAKEN_EMAIL, phone: FREE_PHONE })).resolves.toEqual({
      emailTaken: true,
      phoneTaken: false,
    });
  });

  it('reports a taken phone on its own', async () => {
    await expect(checkAvailability({ email: FREE_EMAIL, phone: TAKEN_PHONE })).resolves.toEqual({
      emailTaken: false,
      phoneTaken: true,
    });
  });

  it('reports both taken at once, so the client can flag both fields', async () => {
    await expect(checkAvailability({ email: TAKEN_EMAIL, phone: TAKEN_PHONE })).resolves.toEqual({
      emailTaken: true,
      phoneTaken: true,
    });
  });

  it('looks the values up exactly as given — the route has already normalised them', async () => {
    await checkAvailability({ email: FREE_EMAIL, phone: FREE_PHONE });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: FREE_EMAIL } });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { phone: FREE_PHONE } });
  });
});

describe('phoneHasAccount', () => {
  const mockGetUserByPhone = firebaseAuth.getUserByPhoneNumber as jest.Mock;
  const withProviders = (...ids: string[]) => ({ providerData: ids.map((providerId) => ({ providerId })) });

  it('is true for a number a row holds, without asking Firebase', async () => {
    await expect(phoneHasAccount(TAKEN_PHONE)).resolves.toEqual({ hasAccount: true });
    expect(mockGetUserByPhone).not.toHaveBeenCalled();
  });

  it('is false when neither a row nor a Firebase user holds it', async () => {
    mockGetUserByPhone.mockRejectedValueOnce({ code: 'auth/user-not-found' });
    await expect(phoneHasAccount(FREE_PHONE)).resolves.toEqual({ hasAccount: false });
  });

  it('is false for a phone-only Firebase user with no row — the stray the SMS door discards', async () => {
    mockGetUserByPhone.mockResolvedValueOnce(withProviders('phone'));
    await expect(phoneHasAccount(FREE_PHONE)).resolves.toEqual({ hasAccount: false });
  });

  it('is true for an unfinished sign-up that has a password too — it gets resumed', async () => {
    mockGetUserByPhone.mockResolvedValueOnce(withProviders('phone', 'password'));
    await expect(phoneHasAccount(FREE_PHONE)).resolves.toEqual({ hasAccount: true });
  });

  it('is true for an unfinished Google sign-up that linked the number', async () => {
    mockGetUserByPhone.mockResolvedValueOnce(withProviders('google.com', 'phone'));
    await expect(phoneHasAccount(FREE_PHONE)).resolves.toEqual({ hasAccount: true });
  });

  it('rethrows any other Firebase failure — an unknown answer is never "no account"', async () => {
    mockGetUserByPhone.mockRejectedValueOnce(new Error('firebase down'));
    await expect(phoneHasAccount(FREE_PHONE)).rejects.toThrow('firebase down');
  });
});

describe('registerUser still refuses what checkAvailability reports as taken', () => {
  it('409s on a taken email, with the same message step 1 shows', async () => {
    const err = await registerUser(DECODED_TAKEN_EMAIL, { ...MOTHER_BODY, email: TAKEN_EMAIL }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this email already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('409s on a taken phone, with the same message step 1 shows', async () => {
    // She verified the number — it simply belongs to an account already.
    const err = await registerUser(DECODED_TAKEN_PHONE, { ...MOTHER_BODY, phone: TAKEN_PHONE }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this phone number already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the email first when both are taken', async () => {
    const err = await registerUser(DECODED_BOTH_TAKEN, {
      ...MOTHER_BODY,
      email: TAKEN_EMAIL,
      phone: TAKEN_PHONE,
    }).catch((e: unknown) => e);
    expect((err as AppError).message).toBe('An account with this email already exists.');
  });
});
