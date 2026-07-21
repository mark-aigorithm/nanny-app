import type { PaymobIntentionElementResponse } from '@backend/lib/paymob/client';

/**
 * Pure mappers over a Paymob intention-element response.
 *
 * These deliberately live outside `client.ts`: that module exports the HTTP
 * client factory, which every Paymob test suite mocks wholesale. Pure helpers
 * sitting alongside it would be blanked out by those mocks and — because the
 * reconcile loop swallows errors as "transient network failures" — the
 * resulting TypeError would vanish silently instead of failing loudly.
 *
 * Shared by both settlement paths (paymob.service.ts for bookings,
 * package-payment.service.ts for package purchases), which also keeps those two
 * services free of an import cycle.
 */

export function mapIntentionElement(
  data: PaymobIntentionElementResponse,
): 'pending' | 'captured' | 'failed' {
  const txns = data.transactions ?? [];
  for (let i = txns.length - 1; i >= 0; i--) {
    const t = txns[i]!;
    if (t.success === true && t.pending === false) return 'captured';
    if (t.success === false && t.pending === false) return 'failed';
  }

  const st = String(data.status ?? '').toLowerCase();
  if (['failed', 'declined', 'voided', 'cancelled'].includes(st)) return 'failed';

  // Require a successful transaction — do not trust `confirmed` or success-like
  // status strings alone (fresh intentions can look "confirmed" before payment).
  return 'pending';
}

/** Latest transaction id (as a string) from an intention element response, or null. */
export function extractLatestTransactionId(
  data: PaymobIntentionElementResponse,
): string | null {
  const txns = data.transactions ?? [];
  for (let i = txns.length - 1; i >= 0; i--) {
    const rawId: unknown = txns[i]!['id'];
    if (typeof rawId === 'number') return String(rawId);
    if (typeof rawId === 'string' && rawId.length > 0) return rawId;
  }
  return null;
}
