/** Staggered delays from intention anchor (T0) for polling when webhooks are slow or dropped. */
export const PAYMOB_RECONCILE_OFFSETS_MS = [30_000, 60_000, 120_000, 180_000, 300_000] as const;

export const PAYMOB_WEBHOOK_PATH = '/webhooks/paymob';
