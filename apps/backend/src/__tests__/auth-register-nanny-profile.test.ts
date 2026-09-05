/**
 * `registerUser` (Task 3 of the nanny-profile-registration-admin-edit plan):
 * for a nanny, the registration payload must populate the User's avatar and
 * the NannyProfile (bio, yearsOfExperience, ageRanges, schedule,
 * availabilityType, isProfileComplete), then reconcile the chosen
 * certifications + skills inside the same transaction. `reconcileNanny*` are
 * mocked at module level (same pattern as nanny-profile-update.test.ts) so
 * this test isolates registerUser's own writes.
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

import { Role, RegisterRequestSchema, type RegisterRequest } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { reconcileNannySkills } from '@backend/services/admin-nanny.service';
import { reconcileNannyCertifications } from '@backend/services/certification.service';
import { consumeVerificationToken } from '@backend/services/email-verification.service';
import { registerUser } from '@backend/services/auth.service';

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
    idVerificationStatus: (data['idVerificationStatus'] as string | undefined) ?? null,
    idDocumentType: (data['idDocumentType'] as string | undefined) ?? null,
    idRejectionReason: null,
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
  termsAcceptedVersion: '1.0',
  address: 'Cairo',
  latitude: 30.05,
  longitude: 31.23,
  idDocumentType: 'NATIONAL_ID',
  idDocumentFrontUrl: 'https://s/o/nanny-ids%2Ffb-1%2Ffront.jpg',
  idDocumentBackUrl: 'https://s/o/nanny-ids%2Ffb-1%2Fback.jpg',
  avatarUrl: 'https://s/o/nanny-ids%2Ffb-1%2Favatar.jpg',
  bio: 'Loves kids',
  yearsOfExperience: 5,
  ageRanges: ['0-1', '2-4'],
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
  termsAcceptedVersion: '1.0',
  latitude: 30.05,
  longitude: 31.23,
  // A mother proves her address mid-wizard too, on the step after her details.
  emailVerificationToken: 'b'.repeat(64),
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
        ageRanges: ['0-1', '2-4'],
        schedule: NANNY_BODY.schedule,
        availabilityType: 'FULL_TIME',
        isProfileComplete: true,
      },
    });

    // Reconciled against the created profile id (99), inside the same tx.
    expect(mockReconcileCertifications).toHaveBeenCalledWith(tx, 99, [1]);
    expect(mockReconcileSkills).toHaveBeenCalledWith(tx, 99, [2]);

    expect(res.avatarUrl).toBe(NANNY_BODY.avatarUrl);
  });

  it('falls back to null/empty defaults and marks the profile incomplete when a required field is missing', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    // No address on file yet (location is one of the completeness gates) and
    // no catalog ids chosen.
    const { address: _address, certificationIds: _cert, skillIds: _skill, ...rest } = NANNY_BODY;
    const body: RegisterRequest = rest;

    await registerUser(DECODED, body);

    expect(tx.nannyProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ isProfileComplete: false }),
    });
    expect(mockReconcileCertifications).toHaveBeenCalledWith(tx, 99, []);
    expect(mockReconcileSkills).toHaveBeenCalledWith(tx, 99, []);
  });

  it('does not create a nanny profile or reconcile anything for a mother', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED, MOTHER_BODY);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.avatarUrl).toBeNull();
    expect(tx.nannyProfile.create).not.toHaveBeenCalled();
    expect(mockReconcileCertifications).not.toHaveBeenCalled();
    expect(mockReconcileSkills).not.toHaveBeenCalled();
    expect(res.avatarUrl).toBeNull();
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

    await registerUser(DECODED_UNVERIFIED, MOTHER_BODY);

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

  it('rejects either role’s payload with no token at the schema, before any service runs', () => {
    const { emailVerificationToken: _nannyToken, ...nannyWithoutToken } = NANNY_BODY;
    const { emailVerificationToken: _motherToken, ...motherWithoutToken } = MOTHER_BODY;

    expect(RegisterRequestSchema.safeParse(nannyWithoutToken).success).toBe(false);
    expect(RegisterRequestSchema.safeParse(motherWithoutToken).success).toBe(false);
    expect(RegisterRequestSchema.safeParse(NANNY_BODY).success).toBe(true);
    expect(RegisterRequestSchema.safeParse(MOTHER_BODY).success).toBe(true);
  });
});
