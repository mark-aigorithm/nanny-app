jest.mock('@backend/db/prisma', () => ({
  prisma: {
    rewardConfig: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    rewardWallet: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    rewardLedgerEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import { prisma } from '@backend/db/prisma';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';
import {
  applyBookingRedemption,
  awardPointsForBooking,
  getRewardConfig,
  grantPoints,
  listWallets,
  refundBookingRedemption,
  updateRewardConfig,
} from '@backend/services/reward.service';

const mockPrisma = prisma as unknown as {
  rewardConfig: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
  rewardWallet: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  rewardLedgerEntry: {
    findFirst: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  user: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $transaction: jest.Mock;
};

const mockNotify = createInAppNotification as jest.Mock;
const mockPush = dispatchPush as jest.Mock;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 6,
    enabled: true,
    pointsPerBookedHour: 10,
    redemptionPointsPerHour: 100,
    minRedemptionPoints: 100,
    referralEnabled: true,
    referrerPoints: 50,
    refereePoints: 50,
    ...overrides,
  };
}

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 30,
    userId: 29,
    pointsBalance: 0,
    lifetimeEarned: 0,
    lifetimeRedeemed: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // By default, run transaction callbacks against the same mock client.
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb(mockPrisma),
  );
});

describe('getRewardConfig', () => {
  it('returns program defaults when no config row exists', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(null);
    await expect(getRewardConfig()).resolves.toEqual({
      enabled: true,
      pointsPerBookedHour: 10,
      redemptionPointsPerHour: 100,
      minRedemptionPoints: 100,
      referralEnabled: true,
      referrerPoints: 200,
      refereePoints: 100,
    });
  });

  it('returns the stored config when a row exists', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(
      makeConfig({ pointsPerBookedHour: 25, enabled: false }),
    );
    const cfg = await getRewardConfig();
    expect(cfg.pointsPerBookedHour).toBe(25);
    expect(cfg.enabled).toBe(false);
  });
});

describe('updateRewardConfig', () => {
  const input = {
    enabled: true,
    pointsPerBookedHour: 15,
    redemptionPointsPerHour: 200,
    minRedemptionPoints: 200,
    referralEnabled: true,
    referrerPoints: 50,
    refereePoints: 50,
  };

  it('creates the singleton on first save', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(null);
    mockPrisma.rewardConfig.create.mockResolvedValue(makeConfig(input));
    const result = await updateRewardConfig(input);
    expect(mockPrisma.rewardConfig.create).toHaveBeenCalledWith({ data: input });
    expect(result.pointsPerBookedHour).toBe(15);
  });

  it('updates the existing singleton', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardConfig.update.mockResolvedValue(makeConfig(input));
    await updateRewardConfig(input);
    expect(mockPrisma.rewardConfig.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: input,
    });
  });
});

describe('awardPointsForBooking', () => {
  it('awards round(hours * rate) points and notifies the parent', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardLedgerEntry.findFirst.mockResolvedValue(null);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 5 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet());
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 3 });

    // 3h * 10 = 30 points on top of the existing 5 → balance 35.
    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: 35, lifetimeEarned: { increment: 30 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'EARN', points: 30, balanceAfter: 35, bookingId: 101 }),
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 29, type: 'POINTS_EARNED' }),
    );
    expect(mockPush).toHaveBeenCalled();
  });

  it('is idempotent — no-op when an EARN entry already exists for the booking', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardLedgerEntry.findFirst.mockResolvedValue({ id: 301 });

    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 3 });

    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('does nothing when the program is disabled', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig({ enabled: false }));
    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 3 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('grantPoints', () => {
  const user = {
    id: 29,
    firstName: 'Sarah',
    lastName: 'Jones',
    email: 's@example.com',
    avatarUrl: null,
  };

  it('credits points and records an ADMIN_GRANT entry', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 50 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(
      makeWallet({ pointsBalance: 70, lifetimeEarned: 20 }),
    );
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    const summary = await grantPoints({
      userId: 29,
      points: 20,
      reason: 'Goodwill',
      adminId: 1,
    });

    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADMIN_GRANT',
          points: 20,
          balanceAfter: 70,
          adminId: 1,
          reason: 'Goodwill',
        }),
      }),
    );
    expect(summary).toMatchObject({ userId: 29, pointsBalance: 70, name: 'Sarah Jones' });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'POINTS_GRANTED' }),
    );
  });

  it('clamps a revoke so the balance never goes negative', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 10 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 0 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    await grantPoints({ userId: 29, points: -50, reason: 'Correction', adminId: 1 });

    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADMIN_REVOKE', points: -10, balanceAfter: 0 }),
      }),
    );
  });

  it('throws 400 when revoking from a zero balance', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 0 }));
    await expect(
      grantPoints({ userId: 29, points: -5, reason: 'x', adminId: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when the target user does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(
      grantPoints({ userId: 999, points: 10, reason: 'x', adminId: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('applyBookingRedemption', () => {
  const params = { userId: 29, bookingId: 101, redeemHours: 2, perHour: 50, durationHours: 3 };

  it('deducts points, records a REDEEM entry, and returns the discount', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 300 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 100 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    // 2h * 100 pts = 200 spent; discount = 2h * 50/hr = 100.
    const result = await applyBookingRedemption(mockPrisma as never, params);

    expect(result).toEqual({ hours: 2, pointsCost: 200, discount: 100 });
    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: 100, lifetimeRedeemed: { increment: 200 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REDEEM', points: -200, balanceAfter: 100, bookingId: 101 }),
      }),
    );
  });

  it('caps redeemed hours at the booking duration', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 500 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 200 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    // Asks for 5h but the booking is only 3h → 3h * 100 = 300 spent.
    const result = await applyBookingRedemption(mockPrisma as never, { ...params, redeemHours: 5 });
    expect(result.hours).toBe(3);
    expect(result.pointsCost).toBe(300);
  });

  it('throws 400 when the balance is insufficient', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 50 }));
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
  });

  it('throws 400 when below the minimum redemption', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(
      makeConfig({ redemptionPointsPerHour: 100, minRedemptionPoints: 300 }),
    );
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 1000 }));
    // 2h * 100 = 200 < 300 minimum.
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('throws 400 when the program is disabled', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig({ enabled: false }));
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('refundBookingRedemption', () => {
  it('restores the points and records a REFUND entry', async () => {
    mockPrisma.rewardWallet.upsert.mockResolvedValue(
      makeWallet({ pointsBalance: 100, lifetimeRedeemed: 200 }),
    );
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 300 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      bookingId: 101,
      points: 200,
    });

    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: 300, lifetimeRedeemed: { decrement: 200 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REFUND', points: 200, balanceAfter: 300, bookingId: 101 }),
      }),
    );
  });

  it('is a no-op when there are no points to refund', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      bookingId: 101,
      points: 0,
    });
    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
  });
});

describe('listWallets (paginated)', () => {
  function makeUserRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 29,
      firstName: 'Nour',
      lastName: 'Ibrahim',
      email: 'nour@example.com',
      avatarUrl: null,
      rewardWallet: {
        userId: 29,
        pointsBalance: 120,
        lifetimeEarned: 200,
        lifetimeRedeemed: 80,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    // listWallets uses the array form of $transaction.
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('applies skip/take for the page and returns the wallet DTOs + meta', async () => {
    mockPrisma.user.count.mockResolvedValue(42);
    mockPrisma.user.findMany.mockResolvedValue([makeUserRow()]);

    const { wallets, meta } = await listWallets({ page: 2, limit: 10 });

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(wallets[0]).toEqual({
      userId: 29,
      name: 'Nour Ibrahim',
      email: 'nour@example.com',
      avatarUrl: null,
      pointsBalance: 120,
      lifetimeEarned: 200,
      lifetimeRedeemed: 80,
    });
    expect(meta).toEqual({ page: 2, limit: 10, total: 42, totalPages: 5 });
  });

  it('passes a case-insensitive name/email search into the where clause', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeUserRow()]);

    await listWallets({ page: 1, limit: 20, search: 'nour' });

    const where = mockPrisma.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { firstName: { contains: 'nour', mode: 'insensitive' } },
      { lastName: { contains: 'nour', mode: 'insensitive' } },
      { email: { contains: 'nour', mode: 'insensitive' } },
    ]);
  });

  it('defaults a wallet-less parent to zeroed balances', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([makeUserRow({ rewardWallet: null })]);

    const { wallets } = await listWallets({ page: 1, limit: 20 });

    expect(wallets[0]).toMatchObject({
      pointsBalance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
    });
  });
});
