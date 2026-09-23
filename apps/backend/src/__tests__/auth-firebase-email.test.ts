import { Role } from '@nanny-app/shared';

jest.mock('@backend/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    address: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { updateUser: jest.fn(), createCustomToken: jest.fn() },
}));

jest.mock('@backend/services/email-verification.service', () => ({
  consumeVerificationToken: jest.fn().mockResolvedValue(undefined),
  assertVerificationTokenIsValid: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@backend/db/prisma';
import { firebaseAuth } from '@backend/lib/firebase';
import {
  assertVerificationTokenIsValid,
  consumeVerificationToken,
} from '@backend/services/email-verification.service';
import { registerUser, setVerifiedEmail } from '@backend/services/auth.service';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockUpdateUser = firebaseAuth.updateUser as unknown as jest.Mock;
const mockCreateCustomToken = firebaseAuth.createCustomToken as unknown as jest.Mock;
const mockConsume = consumeVerificationToken as unknown as jest.Mock;
const mockAssertTokenValid = assertVerificationTokenIsValid as unknown as jest.Mock;

const DECODED = { uid: 'fb-1', phone_number: '+201000000000' } as never;
const HOUR_MS = 60 * 60 * 1000;

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
    emailVerifiedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateUser.mockResolvedValue(undefined);
  mockCreateCustomToken.mockResolvedValue('minted-custom-token');
  mockConsume.mockResolvedValue(undefined);
  mockAssertTokenValid.mockResolvedValue(undefined);
});

describe('setVerifiedEmail', () => {
  it('checks the token before touching Firebase, and spends it only after the swap', async () => {
    const order: string[] = [];
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockAssertTokenValid.mockImplementation(async () => {
      order.push('validate');
    });
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

    expect(mockAssertTokenValid).toHaveBeenCalledWith('mona@example.com', 'tok-1');
    expect(mockUpdateUser).toHaveBeenCalledWith('fb-1', {
      email: 'mona@example.com',
      emailVerified: true,
    });
    expect(order).toEqual(['validate', 'firebase', 'token']);
  });

  it('refuses a garbage or foreign token before touching Firebase at all', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockAssertTokenValid.mockRejectedValue(
      new Error('Your email verification has expired. Please request a new code and try again.'),
    );

    // Without the pre-check, moveFirebaseEmail would run first and could move
    // the account to an address nobody proved (and revoke the caller's own
    // session), only to 400 afterward once consumeVerificationToken noticed —
    // letting any signed-in user squat an arbitrary address on their Firebase
    // account and block its real owner from registering with it.
    await expect(
      setVerifiedEmail(DECODED, { email: 'squatted@example.com', verificationToken: 'garbage' }),
    ).rejects.toThrow('expired');

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
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

  it('mints a fresh session token after the swap, since the swap just revoked the caller\'s own', async () => {
    const order: string[] = [];
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockImplementation(async () => {
      order.push('firebase');
    });
    mockCreateCustomToken.mockImplementation(async () => {
      order.push('customToken');
      return 'minted-custom-token';
    });
    mockPrisma.user.update.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true }),
    );

    const result = await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockCreateCustomToken).toHaveBeenCalledWith('fb-1');
    expect(order.indexOf('customToken')).toBeGreaterThan(order.indexOf('firebase'));
    expect(result.customToken).toBe('minted-custom-token');
  });

  it('mints no session token when Firebase refuses the address', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userRow());
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockUpdateUser.mockRejectedValue(
      Object.assign(new Error('exists'), { code: 'auth/email-already-exists' }),
    );

    await expect(
      setVerifiedEmail(DECODED, { email: 'taken@example.com', verificationToken: 'tok-1' }),
    ).rejects.toThrow('An account with this email already exists.');

    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it('is a no-op when she already holds the verified address', async () => {
    // Outside the recovery window on purpose — this test is about the plain
    // idempotent-address behaviour, not the recovery-token minting the
    // dedicated tests below cover.
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({
        email: 'mona@example.com',
        isEmailVerified: true,
        emailVerifiedAt: new Date(Date.now() - (HOUR_MS + 60_000)),
      }),
    );

    await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockAssertTokenValid).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('mints a recovery token on the no-op path when verified within the last hour, after checking the token', async () => {
    const order: string[] = [];
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({
        email: 'mona@example.com',
        isEmailVerified: true,
        emailVerifiedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      }),
    );
    mockAssertTokenValid.mockImplementation(async () => {
      order.push('validate');
    });
    mockConsume.mockImplementation(async () => {
      order.push('consume');
    });
    mockCreateCustomToken.mockImplementation(async () => {
      order.push('mint');
      return 'minted-custom-token';
    });

    const result = await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    // Recovery path only, not a fresh swap — Firebase's email is untouched.
    expect(mockUpdateUser).not.toHaveBeenCalled();
    // A genuine retry after a lost response always arrives with a fresh,
    // unspent token (verifyEmailOtp only matches unverified rows) — without
    // this check, any valid (even revoked) ID token, the account's own
    // already-verified address, and any non-empty verificationToken would
    // mint a fresh, long-lived session on their own.
    expect(mockAssertTokenValid).toHaveBeenCalledWith('mona@example.com', 'tok-1');
    expect(mockConsume).toHaveBeenCalledWith('mona@example.com', 'tok-1');
    expect(order).toEqual(['validate', 'consume', 'mint']);
    expect(result.customToken).toBe('minted-custom-token');
  });

  it('refuses to mint a recovery token on the no-op path when the token is garbage, and mints nothing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({
        email: 'mona@example.com',
        isEmailVerified: true,
        emailVerifiedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      }),
    );
    mockAssertTokenValid.mockRejectedValue(
      new Error('Your email verification has expired. Please request a new code and try again.'),
    );

    // This is the hole I2 closes: without the check, *any* non-empty
    // verificationToken (Zod only requires min(1)) reached this far and
    // minted a session — turning a stolen or revoked ID token into
    // indefinite access for the first hour after every registration or gate
    // pass.
    await expect(
      setVerifiedEmail(DECODED, { email: 'mona@example.com', verificationToken: 'garbage' }),
    ).rejects.toThrow('expired');

    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it('mints no token on the no-op path once the recovery window has passed, and never checks the token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({
        email: 'mona@example.com',
        isEmailVerified: true,
        emailVerifiedAt: new Date(Date.now() - (HOUR_MS + 60_000)), // just over an hour ago
      }),
    );

    const result = await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockAssertTokenValid).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
    expect(result.customToken).toBeUndefined();
  });

  it('mints no token on the no-op path when emailVerifiedAt was never set, and never checks the token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userRow({ email: 'mona@example.com', isEmailVerified: true, emailVerifiedAt: null }),
    );

    const result = await setVerifiedEmail(DECODED, {
      email: 'mona@example.com',
      verificationToken: 'tok-1',
    });

    expect(mockAssertTokenValid).not.toHaveBeenCalled();
    expect(mockConsume).not.toHaveBeenCalled();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
    expect(result.customToken).toBeUndefined();
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

  it('still resolves when the post-transaction Firebase call fails — the registration already committed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockResolvedValue({
      user: userRow({ isEmailVerified: true }),
      home: { formattedAddress: 'Cairo', latitude: 30, longitude: 31 },
    });
    mockUpdateUser.mockRejectedValue(new Error('Firebase is having a moment'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    // The transaction already committed the row by the time this call runs
    // (auth.service.ts:237) — a failure here must not turn a real, successful
    // registration into a 500, and the idempotent retry path (the `existing`
    // early-return above) never reaches this call again to fix it up later.
    const result = await registerUser(DECODED, {
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

    expect(result.email).toBe('201000000000@phone.nannyapp.local');
    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] failed to mark the new Firebase account email-verified',
      expect.objectContaining({ uid: 'fb-1', err: expect.any(Error) }),
    );

    warnSpy.mockRestore();
  });
});
