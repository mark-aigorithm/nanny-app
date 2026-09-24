/**
 * Where a user's location goes at registration, and where the profile reads it
 * back from. The wizard still sends the flat `address` / `latitude` /
 * `longitude` it always has; the service turns them into the user's first
 * (default) `addresses` row and never touches the deprecated users columns.
 * `/auth/me` then derives its flattened location fields from that row.
 */
jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn() },
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
import { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { getMe, registerUser, updateProfile } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  address: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

// The mother's own number: registration requires the phone Firebase verified.
const DECODED = { uid: 'fb-1', phone_number: '+201004455667' } as never;

const MOTHER_BODY: RegisterRequest = {
  firstName: 'Layla',
  lastName: 'Mostafa',
  email: 'layla@example.com',
  phone: '+201004455667',
  dateOfBirth: '1990-01-01',
  role: Role.MOTHER,
  termsAcceptedVersion: '1.0',
  address: '14 Garden Street, Maadi',
  latitude: 29.9602,
  longitude: 31.2569,
  emailVerificationToken: 'b'.repeat(64),
};

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
    role: 'MOTHER',
    isEmailVerified: true,
    isPhoneVerified: true,
    idVerificationStatus: 'PENDING_ID',
    idDocumentType: null,
    idRejectionReason: null,
    address: null,
    latitude: null,
    longitude: null,
    deletedAt: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    ...overrides,
  };
}

function addressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    userId: 55,
    label: 'Home',
    formattedAddress: '14 Garden Street, Maadi',
    governorate: null,
    area: null,
    street: null,
    building: null,
    floor: null,
    apartment: null,
    landmark: null,
    latitude: new Prisma.Decimal('29.9602'),
    longitude: new Prisma.Decimal('31.2569'),
    isDefault: true,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    ...overrides,
  };
}

function makeTx() {
  return {
    user: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(userRow(data)),
      ),
    },
    nannyProfile: { create: jest.fn() },
    address: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(addressRow(data)),
      ),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe('registerUser — location', () => {
  it('writes the wizard’s address as the user’s default Home row, in the same transaction', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    await registerUser(DECODED, MOTHER_BODY);

    expect(tx.address.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 55,
          label: 'Home',
          formattedAddress: '14 Garden Street, Maadi',
          latitude: 29.9602,
          longitude: 31.2569,
          isDefault: true,
        }),
      }),
    );
  });

  it('answers with the location read back off the new address row', async () => {
    const tx = makeTx();
    mockPrisma.$transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await registerUser(DECODED, MOTHER_BODY);

    expect(res).toMatchObject({
      address: '14 Garden Street, Maadi',
      latitude: 29.9602,
      longitude: 31.2569,
    });
  });
});

describe('getMe — location', () => {
  it('derives address, latitude and longitude from the default address row', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.update.mockResolvedValue(userRow());
    mockPrisma.address.findFirst.mockResolvedValue(addressRow({ formattedAddress: '5 Corniche, Alexandria' }));

    const me = await getMe(DECODED);

    expect(mockPrisma.address.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 55, deletedAt: null, isDefault: true } }),
    );
    expect(me).toMatchObject({ address: '5 Corniche, Alexandria', latitude: 29.9602 });
  });

  it('reports no location for a user with no address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.update.mockResolvedValue(userRow());
    mockPrisma.address.findFirst.mockResolvedValue(null);

    expect(await getMe(DECODED)).toMatchObject({ address: null, latitude: null, longitude: null });
  });
});

describe('updateProfile — location', () => {
  it('never writes location columns, whatever an old client sends', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.update.mockResolvedValue(userRow({ firstName: 'Nadia' }));
    mockPrisma.address.findFirst.mockResolvedValue(null);

    await updateProfile(DECODED, { firstName: 'Nadia', address: 'x', latitude: 1, longitude: 2 } as never);

    const data = mockPrisma.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toEqual({ firstName: 'Nadia' });
  });
});
