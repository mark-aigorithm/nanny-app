import crypto from 'node:crypto';

/**
 * Generate a random 4-digit start PIN as a zero-padded string, e.g. "0042".
 * Uses a CSPRNG (node:crypto), never Math.random.
 */
export function randomStartPin(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

/** Deterministic sha-256 hex hash of a PIN, for storage + comparison. */
export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(pin).digest('hex');
}
