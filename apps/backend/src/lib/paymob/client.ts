import { AppError } from '@backend/lib/errors';

import type { PaymobIntentionCreateBody, PaymobRefundResult } from './types';

export type PaymobIntentionCreateResult = {
  id: string;
  client_secret: string;
};

export type PaymobIntentionElementResponse = {
  id?: string;
  client_secret?: string;
  confirmed?: boolean;
  status?: string;
  transactions?: Array<{
    id?: number;
    success?: boolean;
    pending?: boolean;
    [key: string]: unknown;
  }>;
  special_reference?: string | null;
  [key: string]: unknown;
};

async function readPaymobError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText;
    try {
      const j = JSON.parse(text) as { detail?: string; message?: string };
      return j.detail ?? j.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return res.statusText;
  }
}

export function createPaymobApiClient(secretKey: string, apiBaseUrl: string) {
  const base = apiBaseUrl.replace(/\/$/, '');

  return {
    async createIntention(body: PaymobIntentionCreateBody): Promise<PaymobIntentionCreateResult> {
      const url = `${base}/v1/intention/`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${secretKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const msg = await readPaymobError(res);
        throw new AppError(`Paymob intention failed: ${msg}`, 502);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const id = data['id'];
      const clientSecret =
        (data['client_secret'] as string | undefined) ??
        (data['client_secrete'] as string | undefined); // legacy typo seen in samples

      if (typeof id !== 'string' && typeof id !== 'number') {
        throw new AppError('Paymob intention response missing id.', 502);
      }
      if (typeof clientSecret !== 'string' || !clientSecret.length) {
        throw new AppError('Paymob intention response missing client_secret.', 502);
      }

      return { id: String(id), client_secret: clientSecret };
    },

    /**
     * Refund (fully or partially) an already-captured transaction. `amountCents`
     * below the captured amount is a partial refund — Paymob accumulates the
     * total refunded on the original transaction. Uses the Accept API refund
     * endpoint (not the intention API), authenticated with the same secret key.
     */
    async refund(params: { transactionId: string; amountCents: number }): Promise<PaymobRefundResult> {
      const url = `${base}/api/acceptance/void_refund/refund`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${secretKey}`,
        },
        body: JSON.stringify({
          transaction_id: params.transactionId,
          amount_cents: params.amountCents,
        }),
      });

      if (!res.ok) {
        const msg = await readPaymobError(res);
        throw new AppError(`Paymob refund failed: ${msg}`, 502);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const id = data['id'];
      if (typeof id !== 'string' && typeof id !== 'number') {
        throw new AppError('Paymob refund response missing id.', 502);
      }
      const refundedRaw = data['refunded_amount_cents'];
      return {
        id: String(id),
        refundedAmountCents: typeof refundedRaw === 'number' ? refundedRaw : null,
        // A refund Paymob accepted but that "errored" (e.g. already refunded)
        // comes back with success=false; treat only an explicit false as failure.
        success: data['success'] !== false,
      };
    },

    /** Public read — used to poll intention state when callbacks are delayed. */
    async getIntentionElement(publicKey: string, clientSecret: string): Promise<PaymobIntentionElementResponse> {
      const pk = encodeURIComponent(publicKey);
      const cs = encodeURIComponent(clientSecret);
      const url = `${base}/v1/intention/element/${pk}/${cs}/`;
      const res = await fetch(url, { method: 'GET' });

      if (!res.ok) {
        const msg = await readPaymobError(res);
        throw new AppError(`Paymob intention inquiry failed: ${msg}`, 502);
      }

      return (await res.json()) as PaymobIntentionElementResponse;
    },
  };
}
