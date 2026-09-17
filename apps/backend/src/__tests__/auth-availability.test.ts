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
import { checkAvailability, registerUser } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const TAKEN_EMAIL = 'taken@example.com';
const TAKEN_PHONE = '+201000000001';
const FREE_EMAIL = 'free@example.com';
const FREE_PHONE = '+201000000002';

/** A fresh Firebase uid — no existing row for it, so registration proceeds to the collision checks. */
const DECODED = { uid: 'fb-new', phone_number: FREE_PHONE } as never;

const MOTHER_BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: FREE_EMAIL,
  phone: FREE_PHONE,
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: '1.0',
  latitude: 30.05,
  longitude: 31.23,
  emailVerificationToken: 'b'.repeat(64),
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

describe('registerUser still refuses what checkAvailability reports as taken', () => {
  it('409s on a taken email, with the same message step 1 shows', async () => {
    const err = await registerUser(DECODED, { ...MOTHER_BODY, email: TAKEN_EMAIL }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this email already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('409s on a taken phone, with the same message step 1 shows', async () => {
    const err = await registerUser(DECODED, { ...MOTHER_BODY, phone: TAKEN_PHONE }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).message).toBe('An account with this phone number already exists.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the email first when both are taken', async () => {
    const err = await registerUser(DECODED, {
      ...MOTHER_BODY,
      email: TAKEN_EMAIL,
      phone: TAKEN_PHONE,
    }).catch((e: unknown) => e);
    expect((err as AppError).message).toBe('An account with this email already exists.');
  });
});
