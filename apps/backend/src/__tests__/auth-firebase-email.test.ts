import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn() },
}));

jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import { consumeVerificationToken } from '@backend/services/email-verification.service';
import { registerUser, setVerifiedEmail } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockUpdateUser = firebaseAuth.updateUser as unknown as jest.Mock;
const mockConsume = consumeVerificationToken as unknown as jest.Mock;

const DECODED = { uid: 'fb-1', phone_number: '+201000000000' } as never;

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firebaseUid: 'fb-1',
    email: '201000000000@phone.nannyapp.local',
    phone: '+201000000000',
    firstName: 'Mona',
    lastName: 'Ali',
    dateOfBirth: new Date('1994-01-01'),
    avatarUrl: null,
    role: Role.MOTHER,
    isEmailVerified: false,
    isPhoneVerified: true,
    approvalStatus: 'APPROVED',
    idDocumentType: null,
    rejectionReason: null,
    deletedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue(undefined);
  mockConsume.mockResolvedValue(undefined);
});

describe('setVerifiedEmail', () => {
  it('writes the real address onto the Firebase account before spending the token', async () => {
    const order: string[] = [];
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockImplementation(async () => {
      order.push('firebase');
    });
    mockConsume.mockImplementation(async () => {
      order.push('token');
    });
    mockPrisma.user.update.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true }),
    );

    await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', {
      email: 'mona@example.com',
      emailVerified: true,
    });
    expect(order).toEqual(['firebase', 'token']);
  });

  it('leaves the token unspent when Firebase refuses the address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockRejectedValue(
      Object.assign(new Error('exists'), { code: 'auth/email-already-exists' }),
    );

    await expect(
      setVerifiedEmail(DECODED, { email: 'taken@example.com', verificationToken: 'tok-1' }),
    ).rejects.toThrow('An account with this email already exists.');

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('is a no-op when she already holds the verified address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true }),
    );

    await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
  });
});

describe('registerUser', () => {
  it('marks the freshly-created Firebase account email-verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    // The real transaction body creates the user row, then a Home address via
    // the real (unmocked) address.service, then — for a nanny — a profile and
    // skills; see auth.service.ts:153-229. That plumbing is already exercised
    // by auth-register-address.test.ts and auth-register-nanny-profile.test.ts,
    // so here $transaction resolves straight to its return shape and this test
    // stays focused on what it's actually asserting: the post-transaction
    // Firebase call. registerUser itself still runs for real — only the
    // transaction boundary is mocked, same as every other test in this file.
    mockPrisma.$transaction.mockResolvedValue({
      user: userRow({ isEmailVerified: true }),
      home: { formattedAddress: 'Cairo', latitude: 30, longitude: 31 },
    });

    await registerUser(DECODED, {
      firstName: 'Mona',
      lastName: 'Ali',
      email: 'mona@example.com',
      phone: '+201000000000',
      dateOfBirth: '1994-01-01',
      role: Role.MOTHER,
      termsAcceptedVersion: '1.0',
      latitude: 30.05,
      longitude: 31.23,
      address: 'Cairo',
      emailVerificationToken: 'tok-1',
    } as never);

    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', { emailVerified: true });
  });
});
