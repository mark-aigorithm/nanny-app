import crypto from 'node:crypto';

import type { PaymobTransactionHmacPayload } from './types';

function boolStr(value: boolean): string {
  return value ? 'true' : 'false';
}

/** Concatenated string Paymob uses for transaction callback HMAC (SHA-512). */
export function buildTransactionHmacPlaintext(tx: PaymobTransactionHmacPayload): string {
  const pan = tx.source_data?.pan?.toLowerCase() ?? '';
  const subType = tx.source_data?.sub_type ?? '';
  const type = tx.source_data?.type?.toLowerCase() ?? '';

  return (
    String(tx.amount_cents) +
    tx.created_at +
    tx.currency +
    boolStr(tx.error_occured) +
    boolStr(tx.has_parent_transaction) +
    String(tx.id) +
    String(tx.integration_id) +
    boolStr(tx.is_3d_secure) +
    boolStr(tx.is_auth) +
    boolStr(tx.is_capture) +
    boolStr(tx.is_refunded) +
    boolStr(tx.is_standalone_payment) +
    boolStr(tx.is_voided) +
    String(tx.order.id) +
    String(tx.owner) +
    boolStr(tx.pending) +
    pan +
    subType +
    type +
    boolStr(tx.success)
  );
}

export function computePaymobHmacHex(plaintext: string, hmacSecret: string): string {
  return crypto.createHmac('sha512', hmacSecret).update(plaintext, 'utf8').digest('hex');
}

export function verifyPaymobTransactionHmac(
  plaintext: string,
  receivedHmac: string,
  hmacSecret: string,
): boolean {
  const expected = computePaymobHmacHex(plaintext, hmacSecret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(receivedHmac.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
