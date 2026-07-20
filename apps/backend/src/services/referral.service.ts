import { NotificationType, Prisma, ReferralStatus, Role } from '@prisma/client';

import type {
  RedeemReferralResponse,
  ReferralListItem,
  ReferralSummary,
  ValidateReferralCodeResponse,
} from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { AppError, errors } from '@backend/lib/errors';
import { createInAppNotification, dispatchPush } from '@backend/services/notification.service';
import {
  getOrCreateWallet,
  getRewardConfig,
  resolveUserId,
} from '@backend/services/reward.service';

/** Prisma client or an interactive-transaction client. */
type Db = Prisma.TransactionClient | typeof prisma;

// ── Code generation ────────────────────────────────────────────

/**
 * Ambiguous glyphs are excluded so a code read aloud or off a screenshot cannot
 * be mistyped: no O/0, I/1, or S/5.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 4;
const MAX_CODE_ATTEMPTS = 5;

/** Fallback stem when a first name yields no usable letters (e.g. non-Latin). */
const FALLBACK_STEM = 'FRIEND';

function codeStem(firstName: string): string {
  const letters = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
  return letters.length > 0 ? letters : FALLBACK_STEM;
}

function randomSuffix(): string {
  let out = '';
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Return the user's referral code, generating and persisting one on first use.
 * Codes are created lazily rather than at signup so existing accounts need no
 * backfill. Retries on the unique constraint, which also covers the race where
 * two concurrent requests generate the same suffix.
 */
export async function getOrCreateReferralCode(userId: number): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, firstName: true, referralCode: true },
  });
  if (!user) throw errors.notFound('User not found');
  if (user.referralCode) return user.referralCode;

  const stem = codeStem(user.firstName);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = `${stem}-${randomSuffix()}`;
    try {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: candidate },
        select: { referralCode: true },
      });
      return updated.referralCode ?? candidate;
    } catch (err) {
      // P2002 = unique violation. Another user (or a concurrent request for this
      // user) took the code; try a fresh suffix.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
        throw err;
      }
      // If the collision was this user's own concurrent write, their code is now
      // set — return it rather than burning another attempt.
      const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: { referralCode: true },
      });
      if (current?.referralCode) return current.referralCode;
    }
  }
  throw new AppError('Could not generate a referral code. Please try again.', 500);
}

// ── Notifications (best-effort; never block the caller) ────────

const PUSH_TYPE: Partial<Record<NotificationType, string>> = {
  [NotificationType.REFERRAL_CONVERTED]: 'referral_converted',
  [NotificationType.REFERRAL_JOINED]: 'referral_joined',
};

async function notifyReferral(
  userId: number,
  type: NotificationType,
  title: string,
  body: string,
): Promise<void> {
  try {
    await createInAppNotification({ userId, type, title, body });
    await dispatchPush(userId, {
      title,
      body,
      data: { type: PUSH_TYPE[type] ?? 'referral_converted', title },
    });
  } catch {
    // A referral notification must never block the surrounding action.
  }
}

// ── Redemption (invitee enters a code just after signing up) ───

/**
 * Link an invitee to a referrer and credit the invitee's welcome points.
 *
 * Rejects self-referral, unknown codes, non-parent callers, anyone already
 * referred, and anyone who has already completed a booking — the offer is for
 * genuinely new users, and that last check is what actually enforces the
 * "at signup" semantics rather than trusting the client to call this early.
 */
export async function applyReferralCode(params: {
  refereeUserId: number;
  code: string;
}): Promise<RedeemReferralResponse> {
  const config = await getRewardConfig();
  if (!config.referralEnabled) {
    throw errors.badRequest('Referrals are not available right now.');
  }

  const referee = await prisma.user.findFirst({
    where: { id: params.refereeUserId, deletedAt: null },
    select: { id: true, role: true, firstName: true },
  });
  if (!referee) throw errors.notFound('User not found');
  if (referee.role !== Role.MOTHER) {
    throw errors.badRequest('Only parent accounts can redeem a referral code.');
  }

  const code = params.code.trim().toUpperCase();
  const referrer = await prisma.user.findFirst({
    where: { referralCode: code, deletedAt: null },
    select: { id: true, firstName: true, role: true },
  });
  // Unknown code and self-referral fail identically, so a probing caller cannot
  // use the error to discover whether a code exists.
  if (!referrer || referrer.id === referee.id) {
    throw errors.badRequest('That referral code is not valid.');
  }
  if (referrer.role !== Role.MOTHER) {
    throw errors.badRequest('That referral code is not valid.');
  }

  const existing = await prisma.referral.findFirst({
    where: { refereeId: referee.id, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw errors.conflict('You have already used a referral code.');
  }

  const completedBooking = await prisma.booking.findFirst({
    where: { motherId: referee.id, status: 'COMPLETED', deletedAt: null },
    select: { id: true },
  });
  if (completedBooking) {
    throw errors.badRequest('Referral codes can only be used before your first booking.');
  }

  const points = Math.max(0, config.refereePoints);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: referee.id,
          code,
          status: ReferralStatus.PENDING,
          refereePoints: points,
        },
      });
      if (points > 0) {
        await creditPoints(tx, {
          userId: referee.id,
          points,
          reason: `Welcome bonus from ${referrer.firstName}`,
        });
      }
    });
  } catch (err) {
    // The unique index on referee_id is the real guard against a double redeem
    // racing past the findFirst above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw errors.conflict('You have already used a referral code.');
    }
    throw err;
  }

  if (points > 0) {
    await notifyReferral(
      referee.id,
      NotificationType.REFERRAL_JOINED,
      'Welcome to NannyNow',
      `${points} Care Points are waiting in your wallet, thanks to ${referrer.firstName}.`,
    );
  }

  return { referrerFirstName: referrer.firstName, pointsAwarded: points };
}

/** Mobile: redeem a code as the signed-in parent. */
export async function redeemReferralCode(
  firebaseUid: string,
  code: string,
): Promise<RedeemReferralResponse> {
  return applyReferralCode({ refereeUserId: await resolveUserId(firebaseUid), code });
}

// ── Conversion (invitee's first booking completes) ─────────────

/**
 * Pay out the referrer for an invitee whose booking just completed. Idempotent:
 * the PENDING→CONVERTED transition is checked and applied inside the same
 * transaction, so concurrent checkouts cannot double-credit. A no-op when the
 * user was never referred or the program is switched off.
 *
 * Safe to call outside a transaction — the payout is atomic on its own.
 */
export async function convertReferralForBooking(params: {
  refereeUserId: number;
  bookingId: number;
}): Promise<void> {
  const config = await getRewardConfig();
  if (!config.referralEnabled) return;

  const pending = await prisma.referral.findFirst({
    where: {
      refereeId: params.refereeUserId,
      status: ReferralStatus.PENDING,
      deletedAt: null,
    },
    select: { id: true, referrerId: true },
  });
  if (!pending) return;

  const points = Math.max(0, config.referrerPoints);

  const referee = await prisma.user.findUnique({
    where: { id: params.refereeUserId },
    select: { firstName: true },
  });
  const refereeName = referee?.firstName ?? 'Someone you invited';

  const converted = await prisma.$transaction(async (tx) => {
    // Conditional update: only the transaction that observes PENDING wins, so a
    // second concurrent checkout updates 0 rows and skips the credit.
    const claimed = await tx.referral.updateMany({
      where: { id: pending.id, status: ReferralStatus.PENDING, deletedAt: null },
      data: {
        status: ReferralStatus.CONVERTED,
        convertedAt: new Date(),
        qualifyingBookingId: params.bookingId,
        referrerPoints: points,
      },
    });
    if (claimed.count === 0) return false;

    if (points > 0) {
      await creditPoints(tx, {
        userId: pending.referrerId,
        points,
        reason: `Referral bonus — ${refereeName} joined`,
      });
    }
    return true;
  });

  if (!converted || points <= 0) return;
  await notifyReferral(
    pending.referrerId,
    NotificationType.REFERRAL_CONVERTED,
    'Your referral paid off',
    `${refereeName} completed their first booking — you earned ${points} Care Points!`,
  );
}

// ── Shared ledger write ────────────────────────────────────────

/**
 * Credit a wallet and append the matching REFERRAL ledger entry. Must run
 * inside a transaction so the balance and its history can never diverge.
 */
async function creditPoints(
  db: Db,
  params: { userId: number; points: number; reason: string },
): Promise<void> {
  const wallet = await getOrCreateWallet(params.userId, db);
  const balanceAfter = wallet.pointsBalance + params.points;
  await db.rewardWallet.update({
    where: { id: wallet.id },
    data: {
      pointsBalance: balanceAfter,
      lifetimeEarned: { increment: params.points },
    },
  });
  await db.rewardLedgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: params.userId,
      type: 'REFERRAL',
      points: params.points,
      balanceAfter,
      reason: params.reason,
    },
  });
}

// ── Reads ──────────────────────────────────────────────────────

function buildShareMessage(code: string, refereePoints: number): string {
  return (
    `I've been using NannyNow to book trusted childcare. ` +
    `Use my code ${code} when you sign up and you'll start with ${refereePoints} Care Points ` +
    `— that's free care time on your first booking.`
  );
}

/** Everything the Refer a friend screen renders, in one call. */
export async function getReferralSummary(firebaseUid: string): Promise<ReferralSummary> {
  const userId = await resolveUserId(firebaseUid);
  const [config, code, rows] = await Promise.all([
    getRewardConfig(),
    getOrCreateReferralCode(userId),
    prisma.referral.findMany({
      where: { referrerId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        referrerPoints: true,
        createdAt: true,
        convertedAt: true,
        referee: { select: { firstName: true } },
      },
    }),
  ]);

  const referrals: ReferralListItem[] = rows.map((r) => ({
    id: r.id,
    firstName: r.referee.firstName,
    status: r.status,
    // Only a converted referral has actually paid the referrer.
    points: r.status === ReferralStatus.CONVERTED ? r.referrerPoints : 0,
    createdAt: r.createdAt.toISOString(),
    convertedAt: r.convertedAt?.toISOString() ?? null,
  }));

  return {
    code,
    shareMessage: buildShareMessage(code, config.refereePoints),
    enabled: config.referralEnabled,
    referrerPoints: config.referrerPoints,
    refereePoints: config.refereePoints,
    stats: {
      invited: referrals.length,
      joined: referrals.filter((r) => r.status === ReferralStatus.CONVERTED).length,
      pointsEarned: referrals.reduce((sum, r) => sum + r.points, 0),
    },
    referrals,
  };
}

/**
 * Check a code before the invitee submits it, so the signup field can confirm
 * who invited them. Returns `valid: false` rather than throwing — an invalid
 * code is an expected outcome here, not an error.
 */
export async function validateReferralCode(
  firebaseUid: string | null,
  code: string,
): Promise<ValidateReferralCodeResponse> {
  const config = await getRewardConfig();
  const invalid: ValidateReferralCodeResponse = {
    valid: false,
    referrerFirstName: null,
    refereePoints: config.refereePoints,
  };
  if (!config.referralEnabled) return invalid;

  // Called mid-signup, before an account exists, so an anonymous caller is
  // expected. The self-referral check only applies once we know who is asking.
  const userId = firebaseUid ? await resolveUserId(firebaseUid) : null;
  const referrer = await prisma.user.findFirst({
    where: { referralCode: code.trim().toUpperCase(), deletedAt: null, role: Role.MOTHER },
    select: { id: true, firstName: true },
  });
  if (!referrer || referrer.id === userId) return invalid;

  return {
    valid: true,
    referrerFirstName: referrer.firstName,
    refereePoints: config.refereePoints,
  };
}
