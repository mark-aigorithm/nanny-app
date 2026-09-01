import { EmailStatus, EmailTemplate, type Prisma } from '@prisma/client';
import type { VerifyEmailOtpResponse } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { config } from '@backend/lib/config';
import { renderEmail } from '@backend/lib/email/render';
import { sendEmail } from '@backend/lib/email/transport';
import { errors } from '@backend/lib/errors';
import type { DecodedIdToken } from '@backend/lib/firebase';
import { hashOtp, randomOtpCode, randomVerificationToken } from '@backend/lib/otp';

/**
 * Proving someone owns an email address, by mailing a 6-digit code to it.
 *
 * Two phases, because the address is proven before the account that will carry
 * it necessarily exists: `verifyEmailOtp` swaps a correct code for a one-time
 * token, and `consumeVerificationToken` spends that token — from
 * `registerUser` (nanny sign-up) or `setVerifiedEmail` (the mother's
 * pre-booking gate). The token is what binds "this address was proven" to
 * "this user row" across the unauthenticated boundary.
 *
 * Unlike email.service.ts, sends here are NOT best-effort. The user is staring
 * at a code entry box; a transport failure has to reach them as an error, not
 * be swallowed into a log line.
 *
 * Abuse control is per-address and lives in the `email_verifications` rows
 * themselves (one row per send, so the windows are just counts). There is no
 * per-IP limit — that belongs to the Redis-backed rate-limit middleware
 * (FOUND-05), which does not exist yet. Until it does, a determined caller can
 * still spread sends across many addresses.
 */

/** How long a code stays enterable. */
const CODE_TTL_MINUTES = 10;
/** How long the token issued on success stays spendable. Longer than the code: the nanny still has several wizard steps to finish. */
const TOKEN_TTL_MINUTES = 15;
/** Minimum gap between two sends to the same address. */
const RESEND_COOLDOWN_SECONDS = 60;
/** Maximum sends to one address per hour. */
const MAX_SENDS_PER_HOUR = 5;
/** Wrong guesses allowed against a single code before it is burned. */
const MAX_ATTEMPTS = 5;

const MINUTE_MS = 60_000;

/**
 * Refuse an address that already belongs to somebody else. `excludeUserId` is
 * the caller's own row (the mother re-verifying), so re-entering the address
 * she already holds isn't reported as a collision. Mirrors the collision check
 * in auth.service.ts's registerUser, which surfaces a friendlier error than
 * letting the unique constraint blow up later.
 */
async function assertEmailAvailable(email: string, excludeUserId?: number): Promise<void> {
  const owner = await prisma.user.findFirst({
    where: {
      email,
      deletedAt: null,
      ...(excludeUserId !== undefined && { id: { not: excludeUserId } }),
    },
    select: { id: true },
  });
  if (owner) {
    throw errors.conflict('An account with this email already exists.');
  }
}

/** Reject a burst of sends to one address before any mail is generated. */
async function assertWithinSendLimits(email: string): Promise<void> {
  const now = Date.now();

  const [recent, lastHourCount] = await Promise.all([
    prisma.emailVerification.findFirst({
      where: { email, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.emailVerification.count({
      where: { email, deletedAt: null, createdAt: { gte: new Date(now - 60 * MINUTE_MS) } },
    }),
  ]);

  if (recent) {
    const elapsedSeconds = (now - recent.createdAt.getTime()) / 1000;
    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);
      throw errors.tooManyRequests(`Please wait ${wait} seconds before requesting another code.`);
    }
  }

  if (lastHourCount >= MAX_SENDS_PER_HOUR) {
    throw errors.tooManyRequests('Too many codes requested. Please try again in an hour.');
  }
}

export interface SendEmailOtpInput {
  email: string;
  /**
   * The signed-in caller, when there is one. A nanny verifies mid-registration
   * with no account yet, so this is null for her; a mother at the booking gate
   * is signed in, and identifying her is what lets "already taken" ignore her
   * own row when she re-verifies an address she already holds.
   */
  decoded?: DecodedIdToken | null;
}

/** The caller's row, when a token identified one. */
async function resolveCaller(
  decoded: DecodedIdToken | null | undefined,
): Promise<{ id: number; firstName: string } | null> {
  if (!decoded) return null;
  return prisma.user.findFirst({
    where: { firebaseUid: decoded.uid, deletedAt: null },
    select: { id: true, firstName: true },
  });
}

/**
 * Mail a fresh code to `email` and record the attempt. Throws rather than
 * returning a result: every failure mode here (unconfigured transport, address
 * taken, rate limit, dead SMTP) is something the user must be told about.
 */
export async function sendEmailOtp(input: SendEmailOtpInput): Promise<void> {
  if (!config.email.enabled) {
    // Deliberately not a silent no-op the way receipts are: without a
    // transport there is no way to finish the flow, so say so loudly.
    throw errors.badRequest('Email is not configured, so a code cannot be sent.');
  }

  const email = input.email.trim().toLowerCase();
  const caller = await resolveCaller(input.decoded);
  await assertEmailAvailable(email, caller?.id);
  await assertWithinSendLimits(email);

  const code = randomOtpCode();
  const { subject, html } = renderEmail(EmailTemplate.EMAIL_VERIFICATION, {
    code,
    ...(caller ? { firstName: caller.firstName } : {}),
    expiryMinutes: CODE_TTL_MINUTES,
  });

  const result = await sendEmail({ to: email, subject, html });

  await prisma.emailLog.create({
    data: {
      recipientEmail: email,
      userId: caller?.id ?? null,
      template: EmailTemplate.EMAIL_VERIFICATION,
      subject,
      status: result.ok ? EmailStatus.SENT : EmailStatus.FAILED,
      error: result.ok ? null : result.error,
    },
  });

  if (!result.ok) {
    throw errors.badRequest('We could not send the code. Please try again in a moment.');
  }

  // Written only after the mail is away, so a code the user never received
  // can't burn their hourly allowance or start the resend cooldown.
  await prisma.emailVerification.create({
    data: {
      email,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * MINUTE_MS),
      userId: caller?.id ?? null,
    },
  });
}

/**
 * Check a code and, on a match, issue the one-time token that proves it.
 * Only the newest outstanding code for the address counts — requesting a
 * resend invalidates whatever came before it, which is what a user expects
 * after tapping "Send a new code".
 */
export async function verifyEmailOtp(
  rawEmail: string,
  code: string,
): Promise<VerifyEmailOtpResponse> {
  const email = rawEmail.trim().toLowerCase();

  const row = await prisma.emailVerification.findFirst({
    where: { email, deletedAt: null, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  // One message for "no code outstanding", "expired" and "too many guesses":
  // the remedy is identical (request a new code), and distinguishing them
  // tells an attacker which addresses have a live code.
  const expired = errors.badRequest('That code has expired. Request a new one.');
  if (!row || row.expiresAt.getTime() <= Date.now() || row.attempts >= MAX_ATTEMPTS) {
    throw expired;
  }

  if (row.codeHash !== hashOtp(code)) {
    const updated = await prisma.emailVerification.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= MAX_ATTEMPTS) throw expired;
    throw errors.badRequest('That code is not right. Please check and try again.');
  }

  const token = randomVerificationToken();
  await prisma.emailVerification.update({
    where: { id: row.id },
    data: {
      verifiedAt: new Date(),
      tokenHash: hashOtp(token),
      // The token gets its own, longer window; reusing expiresAt keeps one
      // clock per row and one column to reason about.
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * MINUTE_MS),
    },
  });

  return {
    verificationToken: token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * MINUTE_MS).toISOString(),
  };
}

/**
 * Spend a verification token, asserting it was issued for `email`, is unspent
 * and is still inside its window. Single-use — the second attempt is refused.
 *
 * Accepts a transaction client so `registerUser` can consume the token inside
 * the same transaction that creates the user, keeping registration atomic:
 * either the row exists with a verified address, or nothing happened.
 */
export async function consumeVerificationToken(
  rawEmail: string,
  token: string,
  client: Prisma.TransactionClient = prisma,
): Promise<void> {
  const email = rawEmail.trim().toLowerCase();

  const row = await client.emailVerification.findFirst({
    where: { tokenHash: hashOtp(token), deletedAt: null },
  });

  if (
    !row ||
    row.email !== email ||
    row.verifiedAt === null ||
    row.consumedAt !== null ||
    row.expiresAt.getTime() <= Date.now()
  ) {
    throw errors.badRequest(
      'Your email verification has expired. Please request a new code and try again.',
    );
  }

  await client.emailVerification.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
}
