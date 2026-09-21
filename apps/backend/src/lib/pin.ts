import crypto from 'node:crypto';

/**
 * Generate a random 4-digit start PIN as a zero-padded string, e.g. "0042".
 * Uses a CSPRNG (node:crypto), never Math.random.
 */
export function randomStartPin(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
