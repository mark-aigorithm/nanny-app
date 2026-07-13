import { NotificationType, Prisma, type RewardEntryType } from '@prisma/client';

import type {
  GrantPointsInput,
  RewardConfig,
  RewardHistoryQuery,
  RewardHistoryResponse,
  RewardLedgerEntry,
  RewardWallet,
  RewardWalletListQuery,
  RewardWalletSummary,
  UpdateRewardConfigInput,
} from '@nanny-app/shared';
import type { PaginationMeta } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';

// Care Points program defaults, used when no config row exists yet.
const DEFAULT_CONFIG: RewardConfig = {
  enabled: true,
  pointsPerBookedHour: 10,
  redemptionPointsPerHour: 100,
  minRedemptionPoints: 100,
};

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Config ─────────────────────────────────────────────────────

type ConfigRow = {
  id: string;
  enabled: boolean;
  pointsPerBookedHour: number;
  redemptionPointsPerHour: number;
  minRedemptionPoints: number;
};

function toConfigDto(row: ConfigRow): RewardConfig {
  return {
    enabled: row.enabled,
    pointsPerBookedHour: row.pointsPerBookedHour,
    redemptionPointsPerHour: row.redemptionPointsPerHour,
    minRedemptionPoints: row.minRedemptionPoints,
  };
}

async function getConfigRow(db: Db = prisma) {
  return db.rewardConfig.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
}

/** Resolved config with program defaults when unconfigured. */
export async function getRewardConfig(db: Db = prisma): Promise<RewardConfig> {
  const row = await getConfigRow(db);
  return row ? toConfigDto(row) : DEFAULT_CONFIG;
}

/** Full-replace update of the singleton config (creates it on first save). */
export async function updateRewardConfig(
  input: UpdateRewardConfigInput,
): Promise<RewardConfig> {
  const existing = await getConfigRow();
  const row = existing
    ? await prisma.rewardConfig.update({ where: { id: existing.id }, data: input })
    : await prisma.rewardConfig.create({ data: input });
  return toConfigDto(row);
}

// ── Wallet helpers ─────────────────────────────────────────────

type WalletRow = {
  id: string;
  userId: string;
  pointsBalance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
};

function toWalletDto(row: WalletRow): RewardWallet {
  return {
    userId: row.userId,
    pointsBalance: row.pointsBalance,
    lifetimeEarned: row.lifetimeEarned,
    lifetimeRedeemed: row.lifetimeRedeemed,
  };
}

function displayName(firstName: string, lastName: string): string {
  // "-" is the placeholder last name used for single-word names; hide it.
  return `${firstName} ${lastName === '-' ? '' : lastName}`.trim();
}

/** Fetch or lazily create a zeroed wallet for a user (race-safe via upsert). */
export async function getOrCreateWallet(userId: string, db: Db = prisma): Promise<WalletRow> {
  return db.rewardWallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

// ── Ledger DTO ─────────────────────────────────────────────────

type LedgerRow = {
  id: string;
  type: RewardEntryType;
  points: number;
  balanceAfter: number;
  reason: string | null;
  bookingId: string | null;
  createdAt: Date;
};

function toEntryDto(row: LedgerRow): RewardLedgerEntry {
  return {
    id: row.id,
    type: row.type,
    points: row.points,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Notifications (best-effort; never block the caller) ────────

const PUSH_TYPE: Record<string, string> = {
  POINTS_EARNED: 'points_earned',
  POINTS_GRANTED: 'points_granted',
  POINTS_REDEEMED: 'points_redeemed',
};

async function notifyPoints(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  try {
    await createInAppNotification({ userId, type, title, body });
    await dispatchPush(userId, { title, body, data: { type: PUSH_TYPE[type] ?? 'points_earned', title } });
  } catch {
    // A reward notification must never block the surrounding action.
  }
}

// ── Earning (booking completion hook) ──────────────────────────

/**
 * Award Care Points for a completed booking. Idempotent — a second call for the
 * same booking is a no-op (guarded by the existing EARN ledger entry). No-op
 * when the program is disabled or the rate is zero. Safe to call outside a
 * transaction; the wallet + ledger write is atomic on its own.
 */
export async function awardPointsForBooking(input: {
  bookingId: string;
  motherId: string;
  durationHours: number;
}): Promise<void> {
  const config = await getRewardConfig();
  if (!config.enabled || config.pointsPerBookedHour <= 0) return;

  const points = Math.round(input.durationHours * config.pointsPerBookedHour);
  if (points <= 0) return;

  const awarded = await prisma.$transaction(async (tx) => {
    const already = await tx.rewardLedgerEntry.findFirst({
      where: { bookingId: input.bookingId, type: 'EARN', deletedAt: null },
      select: { id: true },
    });
    if (already) return false;

    const wallet = await getOrCreateWallet(input.motherId, tx);
    const balanceAfter = wallet.pointsBalance + points;
    await tx.rewardWallet.update({
      where: { id: wallet.id },
      data: { pointsBalance: balanceAfter, lifetimeEarned: { increment: points } },
    });
    await tx.rewardLedgerEntry.create({
      data: {
        walletId: wallet.id,
        userId: input.motherId,
        type: 'EARN',
        points,
        balanceAfter,
        bookingId: input.bookingId,
        reason: `Earned for a ${round2(input.durationHours)}h booking`,
      },
    });
    return true;
  });

  if (!awarded) return;
  await notifyPoints(
    input.motherId,
    NotificationType.POINTS_EARNED,
    'You earned Care Points',
    `You earned ${points} Care Points for your completed booking.`,
  );
}

// ── Redemption at payment ──────────────────────────────────────

/**
 * Redeem Care Points against a booking as part of its (successful) payment.
 * Runs inside the payment transaction: validates the request, deducts the
 * points, and writes a REDEEM ledger entry. Returns the monetary discount and
 * the points spent so the caller can lower the amount charged. Never called on
 * a failed payment — points are only ever spent when the booking is paid.
 */
export async function applyBookingRedemption(
  db: Db,
  params: {
    userId: string;
    bookingId: string;
    redeemHours: number;
    perHour: number;
    durationHours: number;
  },
): Promise<{ hours: number; pointsCost: number; discount: number }> {
  const config = await getRewardConfig(db);
  if (!config.enabled) throw errors.badRequest('Care Points redemption is currently unavailable.');

  const hours = Math.min(Math.floor(params.redeemHours), Math.floor(params.durationHours));
  if (hours < 1) throw errors.badRequest('Choose at least one hour to redeem.');

  const pointsCost = hours * config.redemptionPointsPerHour;
  if (pointsCost < config.minRedemptionPoints) {
    throw errors.badRequest(`You must redeem at least ${config.minRedemptionPoints} points at a time.`);
  }

  const wallet = await getOrCreateWallet(params.userId, db);
  if (wallet.pointsBalance < pointsCost) {
    throw errors.badRequest('You do not have enough Care Points for this redemption.');
  }

  const balanceAfter = wallet.pointsBalance - pointsCost;
  await db.rewardWallet.update({
    where: { id: wallet.id },
    data: { pointsBalance: balanceAfter, lifetimeRedeemed: { increment: pointsCost } },
  });
  await db.rewardLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: params.userId,
      type: 'REDEEM',
      points: -pointsCost,
      balanceAfter,
      bookingId: params.bookingId,
      reason: `Redeemed ${hours} free hour${hours === 1 ? '' : 's'} at checkout`,
    },
  });

  const discount = round2(hours * params.perHour);
  return { hours, pointsCost, discount };
}

/** Fire the "points redeemed" notification (best-effort). */
export async function notifyPointsRedeemed(
  userId: string,
  pointsCost: number,
  hours: number,
): Promise<void> {
  await notifyPoints(
    userId,
    NotificationType.POINTS_REDEEMED,
    'Care Points redeemed',
    `You redeemed ${pointsCost} points for ${hours} free care hour${hours === 1 ? '' : 's'} on your booking.`,
  );
}

/**
 * Reverse a booking's redemption within a transaction: restore the points to
 * the wallet and record a REFUND ledger entry. Used when a payment is not
 * completed (failure or cancellation).
 */
export async function refundBookingRedemption(
  db: Db,
  params: { userId: string; bookingId: string; points: number },
): Promise<void> {
  if (params.points <= 0) return;
  const wallet = await getOrCreateWallet(params.userId, db);
  const balanceAfter = wallet.pointsBalance + params.points;
  await db.rewardWallet.update({
    where: { id: wallet.id },
    data: { pointsBalance: balanceAfter, lifetimeRedeemed: { decrement: params.points } },
  });
  await db.rewardLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: params.userId,
      type: 'REFUND',
      points: params.points,
      balanceAfter,
      bookingId: params.bookingId,
      reason: 'Refunded — payment not completed',
    },
  });
}

/** Fire the "points refunded" notification (best-effort). */
export async function notifyPointsRefunded(userId: string, points: number): Promise<void> {
  await notifyPoints(
    userId,
    NotificationType.POINTS_GRANTED,
    'Care Points refunded',
    `${points} Care Points were returned to your balance.`,
  );
}

/** Caller's own wallet (mobile). */
export async function getWalletForUser(userId: string): Promise<RewardWallet> {
  const wallet = await getOrCreateWallet(userId);
  return toWalletDto(wallet);
}

/** Resolve an internal user id from a Firebase uid (mobile-facing helpers). */
async function resolveUserId(firebaseUid: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { firebaseUid, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw errors.unauthorized();
  return user.id;
}

/** Mobile: the signed-in parent's own wallet. */
export async function getMyWallet(firebaseUid: string): Promise<RewardWallet> {
  return getWalletForUser(await resolveUserId(firebaseUid));
}

/** Mobile: the signed-in parent's own Care Points history. */
export async function getMyHistory(
  firebaseUid: string,
  query: RewardHistoryQuery,
): Promise<RewardHistoryResponse> {
  return getWalletHistory(await resolveUserId(firebaseUid), query);
}


// ── Admin: manual grant / revoke ───────────────────────────────

/** Admin credits (positive) or debits (negative) a user's points balance. */
export async function grantPoints(input: {
  userId: string;
  points: number;
  reason: string;
  adminId: string;
}): Promise<RewardWalletSummary> {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
  });
  if (!user) throw errors.notFound('User not found');

  const isGrant = input.points > 0;
  const updated = await prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(input.userId, tx);
    // Clamp a revoke so the balance never goes negative.
    const delta = Math.max(input.points, -wallet.pointsBalance);
    if (delta === 0) {
      throw errors.badRequest('This user has no Care Points to revoke.');
    }
    const balanceAfter = wallet.pointsBalance + delta;
    const row = await tx.rewardWallet.update({
      where: { id: wallet.id },
      data: {
        pointsBalance: balanceAfter,
        ...(delta > 0 ? { lifetimeEarned: { increment: delta } } : {}),
      },
    });
    await tx.rewardLedgerEntry.create({
      data: {
        walletId: wallet.id,
        userId: input.userId,
        type: delta > 0 ? 'ADMIN_GRANT' : 'ADMIN_REVOKE',
        points: delta,
        balanceAfter,
        reason: input.reason,
        adminId: input.adminId,
      },
    });
    return row;
  });

  await notifyPoints(
    input.userId,
    NotificationType.POINTS_GRANTED,
    isGrant ? 'You received Care Points' : 'Care Points adjusted',
    isGrant
      ? `You've been given ${input.points} Care Points: ${input.reason}`
      : `Your Care Points balance was adjusted: ${input.reason}`,
  );

  return {
    ...toWalletDto(updated),
    name: displayName(user.firstName, user.lastName),
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

// ── Admin: wallet directory + history ──────────────────────────

/** Parent accounts with their Care Points balances (admin User Wallets tab). */
export async function listWallets(
  { page, limit, search }: RewardWalletListQuery,
): Promise<{ wallets: RewardWalletSummary[]; meta: PaginationMeta }> {
  const trimmed = search?.trim();
  const where: Prisma.UserWhereInput = {
    role: 'MOTHER',
    deletedAt: null,
    ...(trimmed
      ? {
          OR: [
            { firstName: { contains: trimmed, mode: 'insensitive' } },
            { lastName: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        rewardWallet: {
          select: {
            userId: true,
            pointsBalance: true,
            lifetimeEarned: true,
            lifetimeRedeemed: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const wallets = rows.map((row) => ({
    userId: row.id,
    name: displayName(row.firstName, row.lastName),
    email: row.email,
    avatarUrl: row.avatarUrl,
    pointsBalance: row.rewardWallet?.pointsBalance ?? 0,
    lifetimeEarned: row.rewardWallet?.lifetimeEarned ?? 0,
    lifetimeRedeemed: row.rewardWallet?.lifetimeRedeemed ?? 0,
  }));

  return {
    wallets,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

/** Single user's wallet summary (admin drill-in header). */
export async function getWalletSummary(userId: string): Promise<RewardWalletSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
  });
  if (!user) throw errors.notFound('User not found');
  const wallet = await getOrCreateWallet(userId);
  return {
    ...toWalletDto(wallet),
    name: displayName(user.firstName, user.lastName),
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

/** Paginated grant/redemption history for a user (admin drill-in + mobile). */
export async function getWalletHistory(
  userId: string,
  query: RewardHistoryQuery,
): Promise<RewardHistoryResponse> {
  const where = { userId, deletedAt: null };
  const skip = (query.page - 1) * query.limit;

  const [total, rows] = await Promise.all([
    prisma.rewardLedgerEntry.count({ where }),
    prisma.rewardLedgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
  ]);

  const meta: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.ceil(total / query.limit) || 1,
  };

  return { entries: rows.map(toEntryDto), meta };
}
