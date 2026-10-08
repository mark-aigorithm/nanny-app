jest.mock('@backend/db/prisma', () => ({
  prisma: {
    rewardConfig: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    rewardWallet: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    rewardLedgerEntry: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('@backend/services/notification.service', () => ({
  createInAppNotification: jest.fn(),
  dispatchPush: jest.fn(),
}));

import type { Prisma } from '@prisma/client';

import { prisma } from '@backend/db/prisma';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import {
  applyBookingRedemption,
  awardPointsForBooking,
  getMyHistory,
  getMyWallet,
  getRewardConfig,
  getWalletForUser,
  getWalletHistory,
  getWalletSummary,
  grantPoints,
  listWallets,
  notifyPointsRedeemed,
  notifyPointsRefunded,
  refundBookingRedemption,
  resolveUserId,
  updateRewardConfig,
} from '@backend/services/reward.service';

const mockPrisma = prisma as unknown as {
  rewardConfig: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock };
  rewardWallet: {
    upsert: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  rewardLedgerEntry: {
    findFirst: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  user: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  $queryRaw: jest.Mock;
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
        data: expect.objectContaining({
          type: 'EARN',
          points: 30,
          balanceAfter: 35,
          bookingId: 101,
        }),
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
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'POINTS_GRANTED' }));
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
  const params = {
    userId: 29,
    scope: { bookingId: 101 },
    redeemHours: 2,
    perHour: 50,
    durationHours: 3,
    owedAmount: 150,
  };

  it('deducts points, records a REDEEM entry, and returns the discount', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 300 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 100 });
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    // 2h * 100 pts = 200 spent; discount = 2h * 50/hr = 100.
    const result = await applyBookingRedemption(mockPrisma as never, params);

    expect(result).toEqual({ hours: 2, pointsCost: 200, discount: 100 });
    // Debited only if the balance still covers it when the write lands.
    expect(mockPrisma.rewardWallet.updateMany).toHaveBeenCalledWith({
      where: { id: 30, pointsBalance: { gte: 200 } },
      data: { pointsBalance: { decrement: 200 }, lifetimeRedeemed: { increment: 200 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REDEEM',
          points: -200,
          balanceAfter: 100,
          bookingId: 101,
        }),
      }),
    );
  });

  it('caps redeemed hours at the booking duration', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 500 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 200 });
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    // Asks for 5h but the booking is only 3h → 3h * 100 = 300 spent.
    const result = await applyBookingRedemption(mockPrisma as never, { ...params, redeemHours: 5 });
    expect(result.hours).toBe(3);
    expect(result.pointsCost).toBe(300);
  });

  it('caps redeemed hours at the hours still owed after other credits', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 500 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 400 });
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    // Package hours already paid for 2 of the 3 hours: 50 is left. Asking for
    // 3h must spend only the one hour that is still owed.
    const result = await applyBookingRedemption(mockPrisma as never, {
      ...params,
      redeemHours: 3,
      owedAmount: 50,
    });

    expect(result).toEqual({ hours: 1, pointsCost: 100, discount: 50 });
    expect(mockPrisma.rewardWallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 30, pointsBalance: { gte: 100 } } }),
    );
  });

  it('lets one point-hour clear a part-hour balance, discounting only what is owed', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 500 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 400 });
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    const result = await applyBookingRedemption(mockPrisma as never, {
      ...params,
      redeemHours: 2,
      owedAmount: 20,
    });

    expect(result).toEqual({ hours: 1, pointsCost: 100, discount: 20 });
  });

  it('refuses without touching the wallet when nothing is left to pay', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 500 }));

    await expect(
      applyBookingRedemption(mockPrisma as never, { ...params, owedAmount: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.rewardWallet.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('throws 400 when the balance is insufficient', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 50 }));
    // The conditional debit matches nothing — the balance can't cover 200.
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent redemption spent the points after the wallet was read', async () => {
    // Read as 300 — enough — but by the write another request has taken them.
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig());
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 300 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 0 });

    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
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
      scope: { bookingId: 101 },
      points: 200,
    });

    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: { increment: 200 }, lifetimeRedeemed: { decrement: 200 } },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'REFUND',
          points: 200,
          balanceAfter: 300,
          bookingId: 101,
        }),
      }),
    );
  });

  it('is a no-op when there are no points to refund', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      scope: { bookingId: 101 },
      points: 0,
    });
    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
  });
});

describe('listWallets (paginated)', () => {
  const LIST_QUERY = { page: 1, limit: 20, sortBy: 'joined', sortDir: 'desc' } as const;

  function makeDirectoryRow(overrides: Record<string, unknown> = {}) {
    return {
      userId: 29,
      firstName: 'Nour',
      lastName: 'Ibrahim',
      email: 'nour@example.com',
      avatarUrl: null,
      pointsBalance: 120,
      lifetimeEarned: 200,
      lifetimeRedeemed: 80,
      ...overrides,
    };
  }

  /** listWallets runs two raw queries — the count, then the page. */
  function mockDirectory(total: number, rows: unknown[]) {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total }]).mockResolvedValueOnce(rows);
  }

  function countSql(): Prisma.Sql {
    return mockPrisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
  }

  function pageSql(): Prisma.Sql {
    return mockPrisma.$queryRaw.mock.calls[1][0] as Prisma.Sql;
  }

  beforeEach(() => {
    // listWallets uses the array form of $transaction.
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('pages with LIMIT/OFFSET and returns the wallet DTOs + meta', async () => {
    mockDirectory(42, [makeDirectoryRow()]);

    const { wallets, meta } = await listWallets({ ...LIST_QUERY, page: 2, limit: 10 });

    expect(pageSql().values.slice(-2)).toEqual([10, 10]);
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

  it('lists only live parents, and counts the same set it pages', async () => {
    mockDirectory(0, []);

    await listWallets(LIST_QUERY);

    for (const sql of [countSql(), pageSql()]) {
      expect(sql.sql).toContain("u.role::text = 'MOTHER' AND u.deleted_at IS NULL");
    }
  });

  it('matches the search against name or email as a bound, literal pattern', async () => {
    mockDirectory(1, [makeDirectoryRow()]);

    await listWallets({ ...LIST_QUERY, search: ' 50%_off\\ ' });

    for (const sql of [countSql(), pageSql()]) {
      expect(sql.sql).toContain('(u.first_name ILIKE ? OR u.last_name ILIKE ? OR u.email ILIKE ?)');
      // Trimmed, wildcards escaped, and never spliced into the SQL text.
      expect(sql.values.slice(0, 3)).toEqual(Array(3).fill('%50\\%\\_off\\\\%'));
      expect(sql.sql).not.toContain('50');
    }
  });

  it('reads a wallet-less parent as zeroed balances', async () => {
    mockDirectory(0, []);

    await listWallets(LIST_QUERY);

    expect(pageSql().sql).toContain('LEFT JOIN reward_wallets w ON w.user_id = u.id');
    expect(pageSql().sql).toContain('COALESCE(w.points_balance, 0) AS "pointsBalance"');
  });

  it.each([
    ['id', 'desc', 'u.id DESC'],
    ['email', 'asc', 'u.email ASC, u.id ASC'],
    ['name', 'asc', 'u.first_name ASC, u.last_name ASC, u.id ASC'],
    // A missing wallet sorts as 0 pts, never as a NULL ahead of real balances.
    ['balance', 'desc', 'COALESCE(w.points_balance, 0) DESC, u.id DESC'],
    ['earned', 'desc', 'COALESCE(w.lifetime_earned, 0) DESC, u.id DESC'],
    ['redeemed', 'asc', 'COALESCE(w.lifetime_redeemed, 0) ASC, u.id ASC'],
    ['joined', 'desc', 'u.created_at DESC, u.id DESC'],
  ] as const)('sorts by %s %s', async (sortBy, sortDir, orderBy) => {
    mockDirectory(0, []);

    await listWallets({ page: 1, limit: 20, sortBy, sortDir });

    expect(pageSql().sql).toContain(`ORDER BY ${orderBy}\n`);
  });
});

// ── Earning: rounding and zero-point guards ─────────────────────────────────

describe('awardPointsForBooking rounding and guards', () => {
  function primeAward(config: Record<string, unknown> = {}) {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig(config));
    mockPrisma.rewardLedgerEntry.findFirst.mockResolvedValue(null);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet());
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet());
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});
  }

  it('does nothing when the earn rate is zero', async () => {
    primeAward({ pointsPerBookedHour: 0 });
    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 3 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when a short booking rounds to zero points', async () => {
    primeAward({ pointsPerBookedHour: 1 });
    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 0.4 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rounds fractional hours to whole points and the reason to 2dp hours', async () => {
    primeAward({ pointsPerBookedHour: 10 });

    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 2.555 });

    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        walletId: 30,
        userId: 29,
        type: 'EARN',
        points: 26,
        balanceAfter: 26,
        bookingId: 101,
        reason: 'Earned for a 2.56h booking',
      },
    });
    expect(mockNotify).toHaveBeenCalledWith({
      userId: 29,
      type: 'POINTS_EARNED',
      title: 'You earned Care Points',
      body: 'You earned 26 Care Points for your completed booking.',
    });
    expect(mockPush).toHaveBeenCalledWith(29, {
      title: 'You earned Care Points',
      body: 'You earned 26 Care Points for your completed booking.',
      data: { type: 'points_earned', title: 'You earned Care Points' },
    });
  });

  it('still awards the points when the notification fails', async () => {
    primeAward();
    mockNotify.mockRejectedValueOnce(new Error('FCM down'));

    await expect(
      awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 1 }),
    ).resolves.toBeUndefined();
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('looks for a live EARN entry for this booking before awarding', async () => {
    primeAward();
    await awardPointsForBooking({ bookingId: 101, motherId: 29, durationHours: 1 });
    expect(mockPrisma.rewardLedgerEntry.findFirst).toHaveBeenCalledWith({
      where: { bookingId: 101, type: 'EARN', deletedAt: null },
      select: { id: true },
    });
  });
});

// ── Redemption: scope columns, floor, messages ──────────────────────────────

describe('applyBookingRedemption rules', () => {
  const params = {
    userId: 29,
    scope: { bookingId: 101 },
    redeemHours: 2,
    perHour: 50,
    durationHours: 3,
    owedAmount: 150,
  };

  function primeRedeem(config: Record<string, unknown> = {}) {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig(config));
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 1000 }));
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 900 });
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});
  }

  it('says redemption is unavailable while the program is off', async () => {
    mockPrisma.rewardConfig.findFirst.mockResolvedValue(makeConfig({ enabled: false }));
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      message: 'Care Points redemption is currently unavailable.',
    });
  });

  it('says there is nothing left to pay when the booking is fully covered', async () => {
    primeRedeem();
    await expect(
      applyBookingRedemption(mockPrisma as never, { ...params, owedAmount: 0 }),
    ).rejects.toMatchObject({
      message: 'There is nothing left to pay on this booking, so no points are needed.',
    });
  });

  it('refuses a request for less than one whole hour', async () => {
    primeRedeem();
    await expect(
      applyBookingRedemption(mockPrisma as never, { ...params, redeemHours: 0.9 }),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Choose at least one hour to redeem.' });
    expect(mockPrisma.rewardWallet.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the booking itself is shorter than one hour', async () => {
    primeRedeem();
    await expect(
      applyBookingRedemption(mockPrisma as never, { ...params, durationHours: 0.5 }),
    ).rejects.toMatchObject({ message: 'Choose at least one hour to redeem.' });
  });

  it('floors fractional requested hours rather than rounding up', async () => {
    primeRedeem();
    const r = await applyBookingRedemption(mockPrisma as never, { ...params, redeemHours: 1.9 });
    expect(r).toEqual({ hours: 1, pointsCost: 100, discount: 50 });
  });

  it('names the minimum in its refusal', async () => {
    primeRedeem({ minRedemptionPoints: 300 });
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      message: 'You must redeem at least 300 points at a time.',
    });
  });

  it('accepts a redemption of exactly the minimum', async () => {
    primeRedeem({ minRedemptionPoints: 200 });
    await expect(applyBookingRedemption(mockPrisma as never, params)).resolves.toMatchObject({
      pointsCost: 200,
    });
  });

  it('says the balance is too low when the conditional debit matches nothing', async () => {
    primeRedeem();
    mockPrisma.rewardWallet.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyBookingRedemption(mockPrisma as never, params)).rejects.toMatchObject({
      message: 'You do not have enough Care Points for this redemption.',
    });
    expect(mockPrisma.rewardWallet.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('records the balance as read after the debit, with a singular reason for one hour', async () => {
    primeRedeem();
    mockPrisma.rewardWallet.findUniqueOrThrow.mockResolvedValue({ pointsBalance: 900 });

    await applyBookingRedemption(mockPrisma as never, { ...params, redeemHours: 1 });

    expect(mockPrisma.rewardWallet.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 30 },
      select: { pointsBalance: true },
    });
    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith({
      data: {
        walletId: 30,
        userId: 29,
        type: 'REDEEM',
        points: -100,
        balanceAfter: 900,
        bookingId: 101,
        bookingExtensionId: null,
        reason: 'Redeemed 1 free hour at checkout',
      },
    });
  });

  it('records an extension redemption against the extension, never the parent booking', async () => {
    primeRedeem();

    await applyBookingRedemption(mockPrisma as never, {
      ...params,
      scope: { bookingExtensionId: 55 },
    });

    expect(mockPrisma.rewardLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: null,
        bookingExtensionId: 55,
        reason: 'Redeemed 2 free hours at checkout',
      }),
    });
  });

  it('rounds the discount to 2dp and never past what is owed', async () => {
    primeRedeem();
    // 33.333/hr × 2h = 66.666 → 66.67, but only 66.66 is owed.
    const r = await applyBookingRedemption(mockPrisma as never, {
      ...params,
      perHour: 33.333,
      owedAmount: 66.66,
    });
    expect(r.discount).toBe(66.66);
  });
});

describe('refundBookingRedemption reasons and scope', () => {
  beforeEach(() => {
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 0 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 200 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});
  });

  it('defaults the reason to an unfinished payment', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      scope: { bookingId: 101 },
      points: 200,
    });
    expect(mockPrisma.rewardLedgerEntry.create.mock.calls[0][0].data.reason).toBe(
      'Refunded — payment not completed',
    );
  });

  it('records the caller’s reason when one is given', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      scope: { bookingId: 101 },
      points: 200,
      reason: 'Refunded — booking cancelled early',
    });
    expect(mockPrisma.rewardLedgerEntry.create.mock.calls[0][0].data.reason).toBe(
      'Refunded — booking cancelled early',
    );
  });

  it('refunds against an extension scope', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      scope: { bookingExtensionId: 55 },
      points: 100,
    });
    expect(mockPrisma.rewardLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      bookingId: null,
      bookingExtensionId: 55,
      balanceAfter: 200,
    });
  });

  it('ignores a negative refund rather than debiting the wallet', async () => {
    await refundBookingRedemption(mockPrisma as never, {
      userId: 29,
      scope: { bookingId: 101 },
      points: -50,
    });
    expect(mockPrisma.rewardWallet.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('redemption notifications', () => {
  it('tells the parent how many points bought how many hours (plural)', async () => {
    await notifyPointsRedeemed(29, 200, 2);
    expect(mockNotify).toHaveBeenCalledWith({
      userId: 29,
      type: 'POINTS_REDEEMED',
      title: 'Care Points redeemed',
      body: 'You redeemed 200 points for 2 free care hours on your booking.',
    });
    expect(mockPush).toHaveBeenCalledWith(29, expect.objectContaining({
      data: { type: 'points_redeemed', title: 'Care Points redeemed' },
    }));
  });

  it('uses the singular for a single hour', async () => {
    await notifyPointsRedeemed(29, 100, 1);
    expect(mockNotify.mock.calls[0][0].body).toBe(
      'You redeemed 100 points for 1 free care hour on your booking.',
    );
  });

  it('tells the parent their points came back on a refund', async () => {
    await notifyPointsRefunded(29, 150);
    expect(mockNotify).toHaveBeenCalledWith({
      userId: 29,
      type: 'POINTS_GRANTED',
      title: 'Care Points refunded',
      body: '150 Care Points were returned to your balance.',
    });
    expect(mockPush).toHaveBeenCalledWith(29, expect.objectContaining({
      data: { type: 'points_granted', title: 'Care Points refunded' },
    }));
  });

  it('swallows a push failure', async () => {
    mockPush.mockRejectedValueOnce(new Error('FCM down'));
    await expect(notifyPointsRefunded(29, 150)).resolves.toBeUndefined();
  });
});

// ── Wallet reads ─────────────────────────────────────────────────────────────

describe('wallet reads', () => {
  it('lazily creates a zeroed wallet for the user and returns its DTO', async () => {
    mockPrisma.rewardWallet.upsert.mockResolvedValue(
      makeWallet({ pointsBalance: 40, lifetimeEarned: 60, lifetimeRedeemed: 20 }),
    );

    await expect(getWalletForUser(29)).resolves.toEqual({
      userId: 29,
      pointsBalance: 40,
      lifetimeEarned: 60,
      lifetimeRedeemed: 20,
    });
    expect(mockPrisma.rewardWallet.upsert).toHaveBeenCalledWith({
      where: { userId: 29 },
      update: {},
      create: { userId: 29 },
    });
  });

  it('resolves a live user from their Firebase uid', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 29 });
    await expect(resolveUserId('uid-29')).resolves.toBe(29);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { firebaseUid: 'uid-29', deletedAt: null },
      select: { id: true },
    });
  });

  it('refuses (401) a uid with no live user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(resolveUserId('uid-x')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns the signed-in parent’s own wallet', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 29 });
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 5 }));
    await expect(getMyWallet('uid-29')).resolves.toMatchObject({ userId: 29, pointsBalance: 5 });
  });

  it('returns the signed-in parent’s own history', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 29 });
    mockPrisma.rewardLedgerEntry.count.mockResolvedValue(0);
    mockPrisma.rewardLedgerEntry.findMany.mockResolvedValue([]);

    await expect(getMyHistory('uid-29', { page: 1, limit: 20 })).resolves.toEqual({
      entries: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });
    expect(mockPrisma.rewardLedgerEntry.count).toHaveBeenCalledWith({
      where: { userId: 29, deletedAt: null },
    });
  });
});

describe('getWalletSummary', () => {
  it('refuses (404) an unknown or deleted user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(getWalletSummary(999)).rejects.toMatchObject({
      statusCode: 404,
      message: 'User not found',
    });
    expect(mockPrisma.rewardWallet.upsert).not.toHaveBeenCalled();
  });

  it('combines the wallet with the user’s name, hiding the "-" placeholder last name', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 29,
      firstName: 'Nour',
      lastName: '-',
      email: 'n@example.com',
      avatarUrl: 'https://cdn/a.png',
    });
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 12 }));

    await expect(getWalletSummary(29)).resolves.toEqual({
      userId: 29,
      pointsBalance: 12,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
      name: 'Nour',
      email: 'n@example.com',
      avatarUrl: 'https://cdn/a.png',
    });
  });
});

describe('getWalletHistory', () => {
  it('pages the live ledger newest first and maps entries to DTOs', async () => {
    const createdAt = new Date('2026-05-01T10:00:00.000Z');
    mockPrisma.rewardLedgerEntry.count.mockResolvedValue(45);
    mockPrisma.rewardLedgerEntry.findMany.mockResolvedValue([
      {
        id: 9,
        type: 'REDEEM',
        points: -100,
        balanceAfter: 50,
        reason: 'Redeemed 1 free hour at checkout',
        bookingId: 101,
        createdAt,
        walletId: 30,
      },
    ]);

    const r = await getWalletHistory(29, { page: 3, limit: 20 });

    expect(mockPrisma.rewardLedgerEntry.findMany).toHaveBeenCalledWith({
      where: { userId: 29, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 40,
      take: 20,
    });
    expect(r).toEqual({
      entries: [
        {
          id: 9,
          type: 'REDEEM',
          points: -100,
          balanceAfter: 50,
          reason: 'Redeemed 1 free hour at checkout',
          bookingId: 101,
          createdAt: createdAt.toISOString(),
        },
      ],
      meta: { page: 3, limit: 20, total: 45, totalPages: 3 },
    });
  });
});

describe('grantPoints notifications and display', () => {
  const user = { id: 29, firstName: 'Sarah', lastName: '-', email: 's@x.com', avatarUrl: null };

  it('only bumps lifetimeEarned on a grant, and tells the parent what she was given', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 0 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 20 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    const r = await grantPoints({ userId: 29, points: 20, reason: 'Goodwill', adminId: 1 });

    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: 20, lifetimeEarned: { increment: 20 } },
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'You received Care Points',
        body: "You've been given 20 Care Points: Goodwill",
      }),
    );
    expect(r.name).toBe('Sarah');
  });

  it('never touches lifetimeEarned on a revoke, and words the notice as an adjustment', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 50 }));
    mockPrisma.rewardWallet.update.mockResolvedValue(makeWallet({ pointsBalance: 30 }));
    mockPrisma.rewardLedgerEntry.create.mockResolvedValue({});

    await grantPoints({ userId: 29, points: -20, reason: 'Correction', adminId: 1 });

    expect(mockPrisma.rewardWallet.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { pointsBalance: 30 },
    });
    expect(mockPrisma.rewardLedgerEntry.create.mock.calls[0][0].data).toMatchObject({
      type: 'ADMIN_REVOKE',
      points: -20,
      balanceAfter: 30,
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Care Points adjusted',
        body: 'Your Care Points balance was adjusted: Correction',
      }),
    );
  });

  it('says there is nothing to revoke and writes nothing from an empty wallet', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.rewardWallet.upsert.mockResolvedValue(makeWallet({ pointsBalance: 0 }));

    await expect(
      grantPoints({ userId: 29, points: -5, reason: 'x', adminId: 1 }),
    ).rejects.toMatchObject({ message: 'This user has no Care Points to revoke.' });
    expect(mockPrisma.rewardWallet.update).not.toHaveBeenCalled();
    expect(mockPrisma.rewardLedgerEntry.create).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe('listWallets edge cases', () => {
  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it('reads a missing count row as zero and still reports one page', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const r = await listWallets({ page: 1, limit: 20, sortBy: 'joined', sortDir: 'desc' });

    expect(r.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('does not filter on a whitespace-only search', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);

    await listWallets({ page: 1, limit: 20, sortBy: 'joined', sortDir: 'desc', search: '   ' });

    expect((mockPrisma.$queryRaw.mock.calls[0][0] as Prisma.Sql).sql).not.toContain('ILIKE');
  });
});
