import type { PaymobTransactionHmacPayload } from './types';

export type PaymobTransactionDto = {
  id: number;
  amount_cents: number;
  integration_id: number;
  owner: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  pending: boolean;
  success: boolean;
  order: {
    id: number;
    merchant_order_id?: string;
  };
  source_data?: {
    pan?: string;
    sub_type?: string;
    type?: string;
  };
  extras?: {
    payment_id?: string;
  };
  payment_key_claims?: {
    extra?: {
      merchant_reference?: string;
      payment_id?: string;
    };
  };
  special_reference?: string;
  data?: {
    message?: string;
  };
};

type PaymobWebhookDto = {
  type: 'TRANSACTION';
  obj: PaymobTransactionDto;
};

/**
 * Normalises Paymob callback bodies:
 * - `{ type: "TRANSACTION", obj: { ... } }` (classic Accept-style envelope)
 * - raw transaction object
 */
export function extractPaymobTransactionObject(body: unknown): Record<string, unknown> | null {
  const payload = body as Partial<PaymobWebhookDto & PaymobTransactionDto>;
  if (payload.type === 'TRANSACTION' && payload.obj) {
    return payload.obj as unknown as Record<string, unknown>;
  }
  return payload as Record<string, unknown>;
}

export function coerceTransactionHmacPayload(obj: Record<string, unknown>): PaymobTransactionHmacPayload {
  const tx = obj as unknown as PaymobTransactionDto;
  return {
    amount_cents: tx.amount_cents,
    created_at: tx.created_at,
    currency: tx.currency,
    error_occured: tx.error_occured,
    has_parent_transaction: tx.has_parent_transaction,
    id: tx.id,
    integration_id: tx.integration_id,
    is_3d_secure: tx.is_3d_secure,
    is_auth: tx.is_auth,
    is_capture: tx.is_capture,
    is_refunded: tx.is_refunded,
    is_standalone_payment: tx.is_standalone_payment,
    is_voided: tx.is_voided,
    order: { id: tx.order.id },
    owner: tx.owner,
    pending: tx.pending,
    success: tx.success,
    source_data: tx.source_data,
  };
}

export function transactionSuccess(txn: Record<string, unknown>): boolean {
  const tx = txn as unknown as PaymobTransactionDto;
  return tx.success === true && tx.pending === false;
}

export function transactionFailed(txn: Record<string, unknown>): boolean {
  const tx = txn as unknown as PaymobTransactionDto;
  return tx.success === false && tx.pending === false;
}

/** Strip Paymob retry suffix (`<paymentId>-r2`) back to the Payment row id. */
export function normalizeMerchantPaymentReference(reference: string): string {
  const trimmed = reference.trim();
  const match = trimmed.match(/^(.+)-r\d+$/);
  return match?.[1] ?? trimmed;
}

/** Resolve our payment row id from callback (special_reference / merchant_order_id / extras). */
export function extractMerchantPaymentId(txn: Record<string, unknown>): number | null {
  const tx = txn as unknown as PaymobTransactionDto;
  const raw =
    tx.extras?.payment_id ??
    tx.order.merchant_order_id ??
    tx.payment_key_claims?.extra?.merchant_reference ??
    tx.payment_key_claims?.extra?.payment_id ??
    tx.special_reference ??
    null;
  if (!raw) return null;
  const normalized = normalizeMerchantPaymentReference(String(raw));
  const id = Number(normalized);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
