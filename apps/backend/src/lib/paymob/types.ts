/** Shape used for HMAC (Accept / unified transaction callbacks). Matches Paymob’s documented field order. */
export type PaymobTransactionHmacPayload = {
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  id: number;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  order: { id: number };
  owner: number;
  pending: boolean;
  success: boolean;
  source_data?: {
    pan?: string;
    sub_type?: string;
    type?: string;
  };
};

/**
 * Body for Paymob's refund endpoint (POST /api/acceptance/void_refund/refund).
 * `amount_cents` less than the captured amount performs a partial refund; Paymob
 * tracks the cumulative refunded amount on the transaction (`refunded_amount_cents`).
 */
export type PaymobRefundBody = {
  transaction_id: string;
  amount_cents: number;
};

export type PaymobRefundResult = {
  /** The refund transaction id Paymob assigns (distinct from the original). */
  id: string;
  /** Cumulative amount refunded against the original transaction, in cents. */
  refundedAmountCents: number | null;
  success: boolean;
};

export type PaymobIntentionCreateBody = {
  amount: number;
  currency: string;
  payment_methods: number[];
  billing_data: Record<string, string | boolean>;
  /** Stable idempotency key — our Payment row id (retry suffix when attempt > 1). */
  merchant_order_id: string;
  special_reference: string;
  notification_url: string;
  redirection_url?: string;
  extras?: Record<string, string>;
};
