jest.mock('@backend/db/prisma', () => ({
  prisma: {
    rewardConfig: { findFirst: jest.fn() },
    rewardWallet: { upsert: jest.fn(), update: jest.fn() },
    rewardLedgerEntry: { create: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    referral: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import {
  applyReferralCode,
  convertReferralForBooking,
  getOrCreateReferralCode,
  getReferralSummary,
  validateReferralCode,
} from '@backend/services/referral.service';

const mockPrisma = prisma as unknown as {
  rewardConfig: { findFirst: jest.Mock };
  rewardWallet: { upsert: jest.Mock; update: jest.Mock };
  rewardLedgerEntry: { create: jest.Mock };
  user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  referral: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  booking: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const REFERRER_ID = 11;
const REFEREE_ID = 22;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    enabled: true,
    pointsPerBookedHour: 10,
    redemptionPointsPerHour: 100,
    minRedemptionPoints: 100,
    referralEnabled: true,
    referrerPoints: 200,
    refereePoints: 100,
    ...overrides,
  };
}

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 90,
    userId: REFEREE_ID,
    pointsBalance: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
    ...overrides,
  };
}

/** A P2002 unique-violation, as Prisma raises it on a duplicate insert. */
function uniqueViolation(target: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [target] },
  });
}

/**
 * Wires up the happy path: program on, referrer resolvable by code, referee is a
 * fresh parent with no prior referral and no completed bookings.
 */
function arrangeRedeemable() {
  mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
  mockPrisma.user.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
    if (args.where.id === REFEREE_ID) {
      return { id: REFEREE_ID, role: 'MOTHER', firstName: 'Dana' };
    }
    if (args.where.referralCode === 'SARAH-4K2P') {
      return { id: REFERRER_ID, firstName: 'Sarah', role: 'MOTHER' };
    }
    return null;
  });
  mockPrisma.referral.findFirst.mockResolvedValue(null);
  mockPrisma.booking.findFirst.mockResolvedValue(null);
  mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet());
  // Set explicitly: clearAllMocks() wipes call history but keeps implementations,
  // so a rejection queued by an earlier test would otherwise leak into this one.
  mockPrisma.referral.create.mockResolvedValue({ id: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  // By default, run transaction callbacks against the same mock client.
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mockPrisma),
  );
});

describe('getOrCreateReferralCode', () => {
  it('returns the existing code without generating a new one', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: REFERRER_ID,
      firstName: 'Sarah',
      referralCode: 'SARAH-4K2P',
    });
    await expect(getOrCreateReferralCode(REFERRER_ID)).resolves.toBe('SARAH-4K2P');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('generates a code from the first name on first use', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: REFERRER_ID,
      firstName: 'Sarah',
      referralCode: null,
    });
    mockPrisma.user.update.mockImplementation(
      async (args: { data: { referralCode: string } }) => ({
        referralCode: args.data.referralCode,
      }),
    );

    const code = await getOrCreateReferralCode(REFERRER_ID);
    expect(code).toMatch(/^SARAH-[A-Z0-9]{4}$/);
  });

  it('falls back to a generic stem when the name has no Latin letters', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: REFERRER_ID,
      firstName: 'دانا',
      referralCode: null,
    });
    mockPrisma.user.update.mockImplementation(
      async (args: { data: { referralCode: string } }) => ({
        referralCode: args.data.referralCode,
      }),
    );

    await expect(getOrCreateReferralCode(REFERRER_ID)).resolves.toMatch(/^FRIEND-[A-Z0-9]{4}$/);
  });

  it('retries with a fresh suffix when the generated code collides', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: REFERRER_ID,
      firstName: 'Sarah',
      referralCode: null,
    });
    mockPrisma.user.update
      .mockRejectedValueOnce(uniqueViolation('referral_code'))
      .mockResolvedValueOnce({ referralCode: 'SARAH-9XQ2' });
    // The collision was another user's code, so this user still has none.
    mockPrisma.user.findUnique.mockResolvedValue({ referralCode: null });

    await expect(getOrCreateReferralCode(REFERRER_ID)).resolves.toBe('SARAH-9XQ2');
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('returns the winner when a concurrent request set the code first', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: REFERRER_ID,
      firstName: 'Sarah',
      referralCode: null,
    });
    mockPrisma.user.update.mockRejectedValue(uniqueViolation('referral_code'));
    mockPrisma.user.findUnique.mockResolvedValue({ referralCode: 'SARAH-CONC' });

    await expect(getOrCreateReferralCode(REFERRER_ID)).resolves.toBe('SARAH-CONC');
    // Stopped as soon as it saw its own code, rather than burning all retries.
    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
  });
});

describe('applyReferralCode', () => {
  it('links the referral and credits the invitee their welcome points', async () => {
    arrangeRedeemable();

    const result = await applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' });

    expect(result).toEqual({ referrerFirstName: 'Sarah', pointsAwarded: 100 });
    expect(mockPrisma.referral.create).toHaveBeenCalledWith({
      data: {
        referrerId: REFERRER_ID,
        refereeId: REFEREE_ID,
        code: 'SARAH-4K2P',
        status: 'PENDING',
        refereePoints: 100,
      },
    });
    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: { pointsBalance: 100, lifetimeEarned: { increment: 100 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REFERRAL',
          points: 100,
          balanceAfter: 100,
          reason: 'Welcome bonus from Sarah',
        }),
      }),
    );
  });

  it('accepts a lowercase, untrimmed code', async () => {
    arrangeRedeemable();
    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: '  sarah-4k2p ' }),
    ).resolves.toEqual({ referrerFirstName: 'Sarah', pointsAwarded: 100 });
  });

  it('rejects self-referral', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.user.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        if (args.where.id === REFEREE_ID) {
          return { id: REFEREE_ID, role: 'MOTHER', firstName: 'Dana' };
        }
        // The code resolves to the caller themselves.
        return { id: REFEREE_ID, firstName: 'Dana', role: 'MOTHER' };
      },
    );

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'DANA-1234' }),
    ).rejects.toThrow('That referral code is not valid.');
    expect(mockPrisma.referral.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown code with the same message as self-referral', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.user.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        args.where.id === REFEREE_ID
          ? { id: REFEREE_ID, role: 'MOTHER', firstName: 'Dana' }
          : null,
    );

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'NOPE-0000' }),
    ).rejects.toThrow('That referral code is not valid.');
  });

  it('rejects a caller who has already used a code', async () => {
    arrangeRedeemable();
    mockPrisma.referral.findFirst.mockResolvedValue({ id: 5 });

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' }),
    ).rejects.toThrow('You have already used a referral code.');
    expect(mockPrisma.referral.create).not.toHaveBeenCalled();
  });

  it('rejects a caller who already completed a booking', async () => {
    arrangeRedeemable();
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 77 });

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' }),
    ).rejects.toThrow('Referral codes can only be used before your first booking.');
    expect(mockPrisma.referral.create).not.toHaveBeenCalled();
  });

  it('rejects a non-parent caller', async () => {
    arrangeRedeemable();
    mockPrisma.user.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        args.where.id === REFEREE_ID
          ? { id: REFEREE_ID, role: 'NANNY', firstName: 'Nia' }
          : { id: REFERRER_ID, firstName: 'Sarah', role: 'MOTHER' },
    );

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' }),
    ).rejects.toThrow('Only parent accounts can redeem a referral code.');
  });

  it('rejects when the program is switched off', async () => {
    arrangeRedeemable();
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(
      makeConfig({ referralEnabled: false }),
    );

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' }),
    ).rejects.toThrow('Referrals are not available right now.');
  });

  it('turns a racing duplicate insert into a friendly conflict', async () => {
    arrangeRedeemable();
    // findFirst saw nothing, but the unique index caught the second writer.
    mockPrisma.referral.create.mockRejectedValue(uniqueViolation('referee_id'));

    await expect(
      applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' }),
    ).rejects.toThrow('You have already used a referral code.');
  });

  it('still links the referral when the welcome grant is configured to zero', async () => {
    arrangeRedeemable();
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig({ refereePoints: 0 }));

    const result = await applyReferralCode({ refereeUserId: REFEREE_ID, code: 'SARAH-4K2P' });

    expect(result.pointsAwarded).toBe(0);
    expect(mockPrisma.referral.create).toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('convertReferralForBooking', () => {
  function arrangeConvertible(overrides: Record<string, unknown> = {}) {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig(overrides));
    mockPrisma.referral.findFirst.mockResolvedValue({ id: 7, referrerId: REFERRER_ID });
    mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'Dana' });
    mockPrisma.referral.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.upsert.mockResolvedValue(
      makeWallet({ userId: REFERRER_ID, pointsBalance: 40 }),
    );
  }

  it('credits the referrer and marks the referral converted', async () => {
    arrangeConvertible();

    await convertReferralForBooking({ refereeUserId: REFEREE_ID, bookingId: 500 });

    expect(mockPrisma.referral.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'PENDING', deletedAt: null },
      data: expect.objectContaining({
        status: 'CONVERTED',
        qualifyingBookingId: 500,
        referrerPoints: 200,
      }),
    });
    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: { pointsBalance: 240, lifetimeEarned: { increment: 200 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: REFERRER_ID,
          type: 'REFERRAL',
          points: 200,
          reason: 'Referral bonus — Dana joined',
        }),
      }),
    );
  });

  it('does not double-credit when a concurrent call already converted it', async () => {
    arrangeConvertible();
    // The conditional update matched no rows: another transaction won the race.
    mockPrisma.referral.updateMany.mockResolvedValue({ count: 0 });

    await convertReferralForBooking({ refereeUserId: REFEREE_ID, bookingId: 500 });

    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('is a no-op for a parent who was never referred', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.referral.findFirst.mockResolvedValue(null);

    await convertReferralForBooking({ refereeUserId: REFEREE_ID, bookingId: 500 });

    expect(mockPrisma.referral.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
  });

  it('is a no-op when the program is switched off', async () => {
    arrangeConvertible({ referralEnabled: false });

    await convertReferralForBooking({ refereeUserId: REFEREE_ID, bookingId: 500 });

    expect(mockPrisma.referral.updateMany).not.toHaveBeenCalled();
  });

  it('snapshots the payout so later config changes do not rewrite history', async () => {
    arrangeConvertible({ referrerPoints: 350 });

    await convertReferralForBooking({ refereeUserId: REFEREE_ID, bookingId: 500 });

    expect(mockPrisma.referral.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referrerPoints: 350 }) }),
    );
  });
});

describe('getReferralSummary', () => {
  it('counts only converted referrals as joined and as earned points', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    // resolveUserId, then getOrCreateReferralCode's own lookup.
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: REFERRER_ID })
      .mockResolvedValueOnce({
        id: REFERRER_ID,
        firstName: 'Sarah',
        referralCode: 'SARAH-4K2P',
      });
    mockPrisma.referral.findMany.mockResolvedValue([
      {
        id: 1,
        status: 'CONVERTED',
        referrerPoints: 200,
        createdAt: new Date('2026-07-01T10:00:00Z'),
        convertedAt: new Date('2026-07-05T10:00:00Z'),
        referee: { firstName: 'Dana' },
      },
      {
        id: 2,
        status: 'PENDING',
        // A stale non-zero value must not leak into the totals while pending.
        referrerPoints: 200,
        createdAt: new Date('2026-07-03T10:00:00Z'),
        convertedAt: null,
        referee: { firstName: 'Mona' },
      },
    ]);

    const summary = await getReferralSummary('firebase-uid');

    expect(summary.code).toBe('SARAH-4K2P');
    expect(summary.stats).toEqual({ invited: 2, joined: 1, pointsEarned: 200 });
    expect(summary.referrals[1]).toEqual(
      expect.objectContaining({ firstName: 'Mona', status: 'PENDING', points: 0 }),
    );
    expect(summary.shareMessage).toContain('SARAH-4K2P');
    expect(summary.shareMessage).toContain('100');
  });
});

describe('validateReferralCode', () => {
  it('confirms a valid code and names the referrer', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: REFEREE_ID })
      .mockResolvedValueOnce({ id: REFERRER_ID, firstName: 'Sarah' });

    await expect(validateReferralCode('firebase-uid', 'sarah-4k2p')).resolves.toEqual({
      valid: true,
      referrerFirstName: 'Sarah',
      refereePoints: 100,
    });
  });

  it('reports a self-referral as simply invalid', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: REFEREE_ID })
      .mockResolvedValueOnce({ id: REFEREE_ID, firstName: 'Dana' });

    await expect(validateReferralCode('firebase-uid', 'DANA-1234')).resolves.toEqual({
      valid: false,
      referrerFirstName: null,
      refereePoints: 100,
    });
  });

  it('reports invalid without a lookup when the program is off', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(
      makeConfig({ referralEnabled: false }),
    );

    await expect(validateReferralCode('firebase-uid', 'SARAH-4K2P')).resolves.toEqual({
      valid: false,
      referrerFirstName: null,
      refereePoints: 100,
    });
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });
});
