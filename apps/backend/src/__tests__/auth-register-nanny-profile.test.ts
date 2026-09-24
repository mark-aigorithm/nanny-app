/**
 * `registerUser` (Task 3 of the nanny-profile-registration-admin-edit plan):
 * for a nanny, the registration payload must populate the User's avatar and
 * the NannyProfile (bio, yearsOfExperience, ageRanges, schedule,
 * availabilityType), then reconcile the chosen
 * certifications + skills inside the same transaction. `reconcileNanny*` are
 * mocked at module level (same pattern as nanny-profile-update.test.ts) so
 * this test isolates registerUser's own writes.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn() },
}));

jest.mock('@backend/lib/config', () => ({
  config: { firebase: { projectId: 'demo-nannyapp', storageBucket: 'demo-nannyapp.appspot.com' } },
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

import { Role, RegisterRequestSchema, type RegisterRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { reconcileNannySkills } from '@backend/services/admin-nanny.service';
import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { consumeVerificationToken } from '@backend/services/email-verification.service';
import { registerUser } from '@backend/services/auth.service';
import { storageUrl } from '../../test/storage-url';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockReconcileCertifications = reconcileNannyCertifications as jest.Mock;
const mockReconcileSkills = reconcileNannySkills as jest.Mock;
const mockConsumeToken = consumeVerificationToken as jest.Mock;

const DECODED = { uid: 'fb-1', email_verified: true, phone_number: '+201000000000' } as never;
/** A Firebase token for an address Firebase itself has not verified — the normal case. */
const DECODED_UNVERIFIED = { uid: 'fb-1', phone_number: '+201000000000' } as never;
/** The same two tokens for the mother's number — the phone must match the one Firebase verified. */
const DECODED_MOTHER = { uid: 'fb-1', email_verified: true, phone_number: '+201004455667' } as never;
const DECODED_MOTHER_UNVERIFIED = { uid: 'fb-1', phone_number: '+201004455667' } as never;

/** Echo the created user row back so toUserResponse can serialise it. */
function userRowFromData(data: Record<string, unknown>) {
  return {
    id: 55,
    firebaseUid: data['firebaseUid'] ?? 'fb-1',
    email: data['email'],
    phone: data['phone'] ?? null,
    firstName: data['firstName'],
    lastName: data['lastName'],
    dateOfBirth: (data['dateOfBirth'] as Date | undefined) ?? null,
    avatarUrl: (data['avatarUrl'] as string | null | undefined) ?? null,
    role: data['role'] ?? null,
    isEmailVerified: !!data['isEmailVerified'],
    isPhoneVerified: !!data['isPhoneVerified'],
    approvalStatus: (data['approvalStatus'] as string | undefined) ?? null,
    idDocumentType: (data['idDocumentType'] as string | undefined) ?? null,
    rejectionReason: null,
    address: (data['address'] as string | undefined) ?? null,
    latitude: (data['latitude'] as number | undefined) ?? null,
    longitude: (data['longitude'] as number | undefined) ?? null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
  };
}

const NANNY_BODY: RegisterRequest = {
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  phone: '+201000000000',
  dateOfBirth: '1998-05-10',
  role: Role.NANNY,
  termsAcceptedVersion: 'v1.0',
  address: 'Cairo',
  latitude: 30.05,
  longitude: 31.23,
  idDocumentType: 'NATIONAL_ID',
  idDocumentFrontUrl: storageUrl('nanny-ids', 'fb-1', 'front.jpg'),
  idDocumentBackUrl: storageUrl('nanny-ids', 'fb-1', 'back.jpg'),
  avatarUrl: storageUrl('avatars', 'fb-1'),
  bio: 'Loves kids',
  yearsOfExperience: 5,
  ageRanges: ['0-1', '1-3'],
  availabilityType: 'FULL_TIME',
  schedule: { '1': { available: true, startTime: '09:00', endTime: '17:00' } },
  certificationIds: [1],
  skillIds: [2],
  // A nanny verifies her address mid-wizard and arrives holding the proof.
  emailVerificationToken: 'a'.repeat(64),
};

const MOTHER_BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: 'layla@example.com',
  phone: '+201004455667',
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: 'v1.0',
  address: 'Cairo',
  latitude: 30.05,
  longitude: 31.23,
  // A mother proves her address mid-wizard too, on the step after her details.
  emailVerificationToken: 'b'.repeat(64),
  avatarUrl: storageUrl('avatars', 'fb-1', 'mother-avatar.jpg'),
};

function makeTx() {
  return {
    user: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(userRowFromData(data)),
      ),
    },
    nannyProfile: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 99, ...data }),
      ),
    },
    // The wizard's location becomes the user's first (default) address row.
    address: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 9, createdAt: new Date(), ...data }),
      ),
    },
  };
}

describe('registerUser — nanny profile population', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No existing user / no email or phone collision.
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('sets the user avatar, populates the nanny profile, and reconciles certs + skills', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED, NANNY_BODY);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.avatarUrl).toBe(NANNY_BODY.avatarUrl);

    expect(tx.nannyProfile.create).toHaveBeenCalledWith({
      data: {
        userId: 55,
        bio: 'Loves kids',
        yearsOfExperience: 5,
        ageRanges: ['0-1', '1-3'],
        schedule: NANNY_BODY.schedule,
        availabilityType: 'FULL_TIME',
      },
    });

    // Reconciled against the created profile id (99), inside the same tx.
    expect(mockReconcileCertifications).toHaveBeenCalledWith(tx, 99, [1]);
    expect(mockReconcileSkills).toHaveBeenCalledWith(tx, 99, [2]);

    expect(res.avatarUrl).toBe(NANNY_BODY.avatarUrl);
  });

  it('falls back to empty catalog ids when none were chosen', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const { certificationIds: _cert, skillIds: _skill, ...rest } = NANNY_BODY;
    const body: RegisterRequest = rest;

    await registerUser(DECODED, body);

    expect(mockReconcileCertifications).toHaveBeenCalledWith(tx, 99, []);
    expect(mockReconcileSkills).toHaveBeenCalledWith(tx, 99, []);
  });

  it('saves the mother’s photo too, but creates no nanny profile or reconciliation', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED_MOTHER, MOTHER_BODY);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.avatarUrl).toBe(MOTHER_BODY.avatarUrl);
    expect(tx.nannyProfile.create).not.toHaveBeenCalled();
    expect(mockReconcileCertifications).not.toHaveBeenCalled();
    expect(mockReconcileSkills).not.toHaveBeenCalled();
    expect(res.avatarUrl).toBe(MOTHER_BODY.avatarUrl);
  });
});

describe('registerUser — email verification token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('spends the token inside the same transaction and marks the address verified', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    // Firebase has not verified this address — our own OTP is the only proof.
    const res = await registerUser(DECODED_UNVERIFIED, NANNY_BODY);

    // Same tx object the user is created on, so a failed registration leaves
    // the token spendable on a retry.
    expect(mockConsumeToken).toHaveBeenCalledWith(NANNY_BODY.email, 'a'.repeat(64), tx);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.isEmailVerified).toBe(true);
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
    expect(res.isEmailVerified).toBe(true);
  });

  it('spends a mother’s token on the same terms — no account starts out unverified', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    await registerUser(DECODED_MOTHER_UNVERIFIED, MOTHER_BODY);

    expect(mockConsumeToken).toHaveBeenCalledWith(MOTHER_BODY.email, 'b'.repeat(64), tx);
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.isEmailVerified).toBe(true);
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('does not create the user when the token is rejected', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
    mockConsumeToken.mockRejectedValueOnce(new Error('Your email verification has expired.'));

    await expect(registerUser(DECODED_UNVERIFIED, NANNY_BODY)).rejects.toThrow('expired');
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('lets a payload with no token through the schema — registerUser decides what proves the address', () => {
    const { emailVerificationToken: _nannyToken, ...nannyWithoutToken } = NANNY_BODY;
    const { emailVerificationToken: _motherToken, ...motherWithoutToken } = MOTHER_BODY;

    expect(RegisterRequestSchema.safeParse(nannyWithoutToken).success).toBe(true);
    expect(RegisterRequestSchema.safeParse(motherWithoutToken).success).toBe(true);
    // Present but empty is still malformed.
    expect(RegisterRequestSchema.safeParse({ ...MOTHER_BODY, emailVerificationToken: '' }).success).toBe(false);
  });
});

describe('registerUser — Google/Apple sign-up without a token', () => {
  const { emailVerificationToken: _unused, ...MOTHER_NO_TOKEN } = MOTHER_BODY;
  /** Firebase vouches for this exact address — what a Google or Apple sign-in yields. */
  const DECODED_GOOGLE = {
    uid: 'fb-1',
    email: 'Layla@Example.com',
    email_verified: true,
    phone_number: '+201004455667',
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('creates the account when Firebase verified this exact address, spending no token', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED_GOOGLE, MOTHER_NO_TOKEN);

    expect(mockConsumeToken).not.toHaveBeenCalled();
    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.email).toBe('layla@example.com');
    expect(userData.isEmailVerified).toBe(true);
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
    expect(res.isEmailVerified).toBe(true);
  });

  it('refuses when Firebase has not verified the address', async () => {
    const decoded = { uid: 'fb-1', email: 'layla@example.com', phone_number: '+201004455667' } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the verified address is not the one being registered', async () => {
    const decoded = {
      uid: 'fb-1',
      email: 'someone-else@example.com',
      email_verified: true,
      phone_number: '+201004455667',
    } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses when the token carries no email at all', async () => {
    const decoded = { uid: 'fb-1', email_verified: true, phone_number: '+201004455667' } as never;

    await expect(registerUser(decoded, MOTHER_NO_TOKEN)).rejects.toThrow(
      'Please verify your email address before finishing sign-up.',
    );
  });

  it('still spends a token when one is sent, even if Firebase also verified the address', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    await registerUser(DECODED_GOOGLE, MOTHER_BODY);

    expect(mockConsumeToken).toHaveBeenCalledWith(MOTHER_BODY.email, 'b'.repeat(64), tx);
  });
});

describe('registerUser — the phone must be the one Firebase verified', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('records the phone as verified when the token carries this exact number', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(
      { uid: 'fb-1', phone_number: MOTHER_BODY.phone } as never,
      MOTHER_BODY,
    );

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.phone).toBe(MOTHER_BODY.phone);
    expect(userData.isPhoneVerified).toBe(true);
    expect(userData.phoneVerifiedAt).toBeInstanceOf(Date);
    expect(res.isPhoneVerified).toBe(true);
  });

  it('refuses a token with no verified phone — e.g. a Google-only account', async () => {
    await expect(
      registerUser({ uid: 'fb-1', email: 'layla@example.com', email_verified: true } as never, MOTHER_BODY),
    ).rejects.toThrow('Please verify your phone number before finishing sign-up.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockConsumeToken).not.toHaveBeenCalled();
  });

  it('refuses a number other than the one Firebase verified', async () => {
    await expect(
      registerUser({ uid: 'fb-1', phone_number: '+201111111111' } as never, MOTHER_BODY),
    ).rejects.toThrow('Please verify your phone number before finishing sign-up.');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('checks the phone before the collision lookup, so an unverified number learns nothing', async () => {
    await expect(
      registerUser({ uid: 'fb-1', phone_number: '+201111111111' } as never, MOTHER_BODY),
    ).rejects.toThrow('Please verify your phone number before finishing sign-up.');
    // Only the idempotency lookup by firebaseUid ran — no email/phone owner lookups.
    expect(mockPrisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { firebaseUid: 'fb-1' } });
  });

  it('still returns an existing row on a retry, before any phone check', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      ...userRowFromData({ email: MOTHER_BODY.email, phone: MOTHER_BODY.phone, firstName: 'Layla', lastName: 'Mostafa' }),
      deletedAt: null,
    });

    const res = await registerUser({ uid: 'fb-1' } as never, MOTHER_BODY);

    expect(res.email).toBe(MOTHER_BODY.email);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
