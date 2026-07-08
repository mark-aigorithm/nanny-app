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
