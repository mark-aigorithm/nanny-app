/**
 * registerUser's defences against a request it must not trust as-is: an email
 * token for an address the account doesn't sign in with, two registrations
 * racing, and a retry that finds Firebase out of step with the row.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));
jest.mock('@backend/lib/firebase', () => ({ firebaseAuth: { updateUser: jest.fn() } }));
jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
}));
jest.mock('@backend/services/address.service', () => ({
  createAddress: jest.fn().mockResolvedValue({
    formattedAddress: '14 Garden Street, Maadi',
    latitude: 29.9602,
    longitude: 31.2569,
  }),
  getDefaultAddress: jest.fn().mockResolvedValue(null),
}));
jest.mock('@backend/services/certification.service', () => ({
  reconcileNannyCertifications: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/admin-nanny.service', () => ({
  reconcileNannySkills: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
  assertVerificationTokenIsValid: jest.fn(),
}));

import { CURRENT_TERMS_VERSION, Role, type RegisterRequest } from '@nanny-app/shared';
import { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { registerUser } from '@backend/services/auth.service';

import { storageUrl } from '../../test/storage-url';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockUpdateUser = firebaseAuth.updateUser as jest.Mock;

const EMAIL = 'layla@example.com';
const PHONE = '+201004455667';
const DECODED = { uid: 'fb-1', email: EMAIL, phone_number: PHONE } as never;

const BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: EMAIL,
  emailVerificationToken: 'b'.repeat(64),
  phone: PHONE,
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: CURRENT_TERMS_VERSION,
  address: '14 Garden Street, Maadi',
  latitude: 29.9602,
  longitude: 31.2569,
  avatarUrl: storageUrl('avatars', 'fb-1'),
};

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    firebaseUid: 'fb-1',
    email: EMAIL,
    phone: PHONE,
    firstName: 'Layla',
    lastName: 'Mostafa',
    dateOfBirth: null,
    avatarUrl: null,
    role: 'MOTHER',
    isEmailVerified: true,
    isPhoneVerified: true,
    approvalStatus: 'PENDING_ID',
    idDocumentType: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-09-24T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTx() {
  return {
    user: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve(userRow(data))),
    },
    nannyProfile: { create: jest.fn() },
  };
}

/**
 * The real shape a P2002 arrives in on this backend's Prisma 7 +
 * @prisma/adapter-pg runtime (observed directly — see
 * apps/backend/src/lib/prisma-errors.ts's doc comment): the column lives on
 * `meta.driverAdapterError.cause.constraint.fields`, not `meta.target`.
 */
function uniqueClash(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'User',
      driverAdapterError: Object.assign(new Error('unique'), {
        cause: { kind: 'UniqueConstraintViolation', constraint: { fields: target } },
      }),
    },
  });
}

/** A legacy (non-driver-adapter) P2002 shape, still supported as a fallback. */
function legacyUniqueClash(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

/** What a lookup by uid finds — flipped mid-test to model the other request committing. */
let rowForUid: ReturnType<typeof userRow> | null;

beforeEach(() => {
  jest.clearAllMocks();
  rowForUid = null;
  mockPrisma.user.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(where['firebaseUid'] ? rowForUid : null),
  );
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(makeTx()));
  mockUpdateUser.mockResolvedValue(undefined);
});

describe('registerUser — the email token must match the account', () => {
  it('refuses a token for an address the account does not sign in with', async () => {
    const other = { uid: 'fb-1', email: 'someone@else.com', phone_number: PHONE } as never;
    await expect(registerUser(other, BODY)).rejects.toThrow(
      "The email you verified doesn't match this account. Please start again.",
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a token on an account with no email at all', async () => {
    const phoneOnly = { uid: 'fb-1', phone_number: PHONE } as never;
    await expect(registerUser(phoneOnly, BODY)).rejects.toThrow(
      "The email you verified doesn't match this account. Please start again.",
    );
  });

  it('matches regardless of capitalisation', async () => {
    const shouty = { uid: 'fb-1', email: 'Layla@Example.com', phone_number: PHONE } as never;
    await expect(registerUser(shouty, BODY)).resolves.toMatchObject({ id: 55 });
  });
});

describe('registerUser — the mother’s photo', () => {
  it('is saved on her row', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementationOnce(async (fn: (t: unknown) => unknown) => fn(tx));

    await registerUser(DECODED, BODY);

    expect(tx.user.create.mock.calls[0]?.[0].data.avatarUrl).toBe(BODY.avatarUrl);
  });
});

describe('registerUser — two requests racing', () => {
  it('returns the row the other request created when this one hit the unique uid', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      rowForUid = userRow();
      throw uniqueClash(['firebase_uid']);
    });
    await expect(registerUser(DECODED, BODY)).resolves.toMatchObject({ id: 55, firebaseUid: 'fb-1' });
  });

  it('returns that row even when this one failed on the token the other just spent', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      rowForUid = userRow();
      throw new Error('This code has already been used.');
    });
    await expect(registerUser(DECODED, BODY)).resolves.toMatchObject({ id: 55 });
  });

  it('answers 409 by the column when someone else took the phone in the gap', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(uniqueClash(['phone']));
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this phone number already exists.',
    });
  });

  it('answers 409 by the column when someone else took the email in the gap', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(uniqueClash(['email']));
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this email already exists.',
    });
  });

  it('still answers 409 by the column for a legacy (non-driver-adapter) P2002 shape', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(legacyUniqueClash(['phone']));
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'An account with this phone number already exists.',
    });
  });

  it('rethrows any other failure when no row appeared', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('connection reset'));
    await expect(registerUser(DECODED, BODY)).rejects.toThrow('connection reset');
  });

  it('answers the same deletion conflict as the idempotent path when the winner row is soft-deleted', async () => {
    mockPrisma.$transaction.mockImplementationOnce(async () => {
      rowForUid = userRow({ deletedAt: new Date() });
      throw uniqueClash(['firebase_uid']);
    });
    await expect(registerUser(DECODED, BODY)).rejects.toMatchObject({
      statusCode: 409,
      message: 'This account has been deleted.',
    });
  });

  it('rethrows the original transaction error when the recovery lookup itself fails', async () => {
    const lookupErr = new Error('connection lost');
    const originalErr = uniqueClash(['phone']);
    // findUnique is called three times before the transaction ever runs (the
    // idempotency check, then the email and phone collision checks inside
    // findIdentityOwners) and once more inside resolveFailedRegistration after
    // the transaction fails — only that last call should reject.
    mockPrisma.user.findUnique
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.resolve(null))
      .mockImplementationOnce(() => Promise.reject(lookupErr));
    mockPrisma.$transaction.mockRejectedValueOnce(originalErr);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(registerUser(DECODED, BODY)).rejects.toBe(originalErr);

    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] could not check for a concurrent registration',
      expect.objectContaining({ uid: 'fb-1', err: lookupErr }),
    );

    warnSpy.mockRestore();
  });
});

describe('registerUser — a retry re-syncs Firebase', () => {
  it('marks the Firebase email verified again when Firebase lost it', async () => {
    rowForUid = userRow();
    const unverified = { uid: 'fb-1', email: EMAIL, email_verified: false, phone_number: PHONE } as never;

    await registerUser(unverified, BODY);

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', { emailVerified: true });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves Firebase alone when it already agrees', async () => {
    rowForUid = userRow();
    const verified = { uid: 'fb-1', email: EMAIL, email_verified: true, phone_number: PHONE } as never;

    await registerUser(verified, BODY);

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('does not fail the retry when the re-sync itself fails', async () => {
    rowForUid = userRow();
    mockUpdateUser.mockRejectedValueOnce(new Error('firebase down'));
    const unverified = { uid: 'fb-1', email: EMAIL, email_verified: false, phone_number: PHONE } as never;

    await expect(registerUser(unverified, BODY)).resolves.toMatchObject({ id: 55 });
  });

  it('never marks a placeholder-email Firebase account verified on the row’s real address', async () => {
    rowForUid = userRow();
    // A legacy account whose Firebase credential is still the phone-derived
    // placeholder — the decoded token's own email must never be trusted as a
    // stand-in for the row's proven one.
    const placeholder = {
      uid: 'fb-1',
      email: '201004455667@phone.nannyapp.local',
      email_verified: false,
      phone_number: PHONE,
    } as never;

    await registerUser(placeholder, BODY);

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });
});
