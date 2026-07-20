import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@backend/db/prisma';
import { registerUser, submitId } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

const DECODED = { uid: 'fb-1', email_verified: true, phone_number: '+201000000000' } as never;

/** Echo the created user row back so toUserResponse can serialise it. */
function userRowFromData(data: Record<string, unknown>) {
  return {
    id: 'user-1',
    firebaseUid: data['firebaseUid'] ?? 'fb-1',
    email: data['email'],
    phone: data['phone'] ?? null,
    firstName: data['firstName'],
    lastName: data['lastName'],
    dateOfBirth: (data['dateOfBirth'] as Date | undefined) ?? null,
    avatarUrl: data['avatarUrl'] ?? null,
    role: data['role'] ?? null,
    isEmailVerified: !!data['isEmailVerified'],
    isPhoneVerified: !!data['isPhoneVerified'],
    idVerificationStatus: (data['idVerificationStatus'] as string | undefined) ?? null,
    idDocumentType: (data['idDocumentType'] as string | undefined) ?? null,
    idRejectionReason: (data['idRejectionReason'] as string | undefined) ?? null,
    address: data['address'] ?? null,
    latitude: (data['latitude'] as number | undefined) ?? null,
    longitude: (data['longitude'] as number | undefined) ?? null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
  };
}

const NANNY_BODY = {
  firstName: 'Amira',
  lastName: 'Hassan',
  email: 'amira@example.com',
  phone: '+201000000000',
  dateOfBirth: '1998-05-10',
  role: Role.NANNY,
  termsAcceptedVersion: '1.0',
  latitude: 30.05,
  longitude: 31.23,
  idDocumentType: 'NATIONAL_ID' as const,
  idDocumentFrontUrl: 'https://s/o/nanny-ids%2Ffb-1%2Ffront.jpg',
  idDocumentBackUrl: 'https://s/o/nanny-ids%2Ffb-1%2Fback.jpg',
};

const MOTHER_BODY = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: 'layla@example.com',
  phone: '+201004455667',
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: '1.0',
  latitude: 30.05,
  longitude: 31.23,
};

describe('registerUser — ID verification defaults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No existing user / no email or phone collision.
    mockPrisma.user.findUnique.mockResolvedValue(null);
  });

  it('starts a nanny at PENDING_REVIEW with the ID stored on the user row', async () => {
    const tx = {
      user: { create: jest.fn(({ data }) => Promise.resolve(userRowFromData(data))) },
      nannyProfile: { create: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED, NANNY_BODY);

    const created = tx.user.create.mock.calls[0][0].data;
    expect(created.idVerificationStatus).toBe('PENDING_REVIEW');
    expect(created.idDocumentType).toBe('NATIONAL_ID');
    expect(created.idDocumentFrontUrl).toBe(NANNY_BODY.idDocumentFrontUrl);
    expect(created.idDocumentBackUrl).toBe(NANNY_BODY.idDocumentBackUrl);
    // A nanny profile is created, but it no longer carries the ID docs.
    expect(tx.nannyProfile.create).toHaveBeenCalledWith({ data: { userId: 'user-1' } });
    expect(res.idVerificationStatus).toBe('PENDING_REVIEW');
  });

  it('starts a mother at PENDING_ID with no ID and no nanny profile', async () => {
    const tx = {
      user: { create: jest.fn(({ data }) => Promise.resolve(userRowFromData(data))) },
      nannyProfile: { create: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED, MOTHER_BODY);

    const created = tx.user.create.mock.calls[0][0].data;
    expect(created.idVerificationStatus).toBe('PENDING_ID');
    expect(created.idDocumentFrontUrl).toBeNull();
    expect(tx.nannyProfile.create).not.toHaveBeenCalled();
    expect(res.idVerificationStatus).toBe('PENDING_ID');
  });
});

describe('submitId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves the account to PENDING_REVIEW and clears the rejection reason', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
    mockPrisma.user.update.mockImplementation(({ data }) =>
      Promise.resolve(
        userRowFromData({
          email: 'x@y.com',
          firstName: 'A',
          lastName: 'B',
          role: Role.MOTHER,
          ...data,
        }),
      ),
    );

    const res = await submitId(DECODED, {
      idDocumentType: 'PASSPORT',
      idDocumentFrontUrl: 'https://s/o/nanny-ids%2Ffb-1%2Ffront.jpg',
    });

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          idVerificationStatus: 'PENDING_REVIEW',
          idRejectionReason: null,
          idDocumentBackUrl: null,
        }),
      }),
    );
    expect(res.idVerificationStatus).toBe('PENDING_REVIEW');
  });
});
