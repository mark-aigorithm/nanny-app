import crypto from 'node:crypto';

/**
 * One-time codes and tokens for email verification. Mirrors lib/pin.ts: a
 * CSPRNG (node:crypto) generates the secret, never Math.random, and only the
 * sha-256 hash is ever stored.
 */

/** Generate a random 6-digit code as a zero-padded string, e.g. "004821". */
export function randomOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Generate the opaque token handed out once a code checks out. 32 bytes of
 * entropy — it is the only thing standing between a stranger and an address
 * marked as verified, so it is not guessable the way a 6-digit code is.
 */
export function randomVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Deterministic sha-256 hex hash of a code or token, for storage + comparison. */
export function hashOtp(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
