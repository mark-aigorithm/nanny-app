/** Staggered delays from intention anchor (T0) for polling when webhooks are slow or dropped. */
export const PAYMOB_RECONCILE_OFFSETS_MS = [30_000, 60_000, 120_000, 180_000, 300_000] as const;

/**
 * How long a Paymob unified-checkout intention (its client_secret / hosted
 * checkout link) is treated as reusable. Paymob expires the hosted link a couple
 * of hours after creation, after which reopening it lands on an "expired payment"
 * page. We regenerate a fresh intention once the stored one is older than this,
 * so we stay comfortably under Paymob's real expiry rather than handing the
 * parent a dead link. Kept well below the ~2-3h observed expiry on purpose.
 */
export const PAYMOB_INTENTION_TTL_MS = 90 * 60_000;

export const PAYMOB_WEBHOOK_PATH = '/webhooks/paymob';

/** Browser/WebView return URL after Paymob checkout (must be HTTPS/HTTP, not app scheme). */
export const PAYMOB_RETURN_PATH = '/paymob/return';
