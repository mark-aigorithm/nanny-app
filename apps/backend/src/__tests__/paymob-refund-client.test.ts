import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { AppError } from '@backend/lib/errors';

/** The refund method hits the Accept API refund endpoint with the secret key. */
describe('paymob client refund', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs transaction_id + amount_cents and returns the parsed result', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 987, refunded_amount_cents: 5000, success: true }),
    })) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    const result = await api.refund({ transactionId: 'txn_1', amountCents: 5000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock as jest.Mock).mock.calls[0];
    expect(url).toBe('https://accept.paymob.com/api/acceptance/void_refund/refund');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Token sk_test' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      transaction_id: 'txn_1',
      amount_cents: 5000,
    });
    expect(result).toEqual({ id: '987', refundedAmountCents: 5000, success: true });
  });

  it('treats an explicit success:false as a failed refund (not an error)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ id: 5, success: false }),
    })) as unknown as typeof fetch;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    const result = await api.refund({ transactionId: 'txn_2', amountCents: 100 });
    expect(result.success).toBe(false);
  });

  it('accepts a string refund id and reports an unknown refunded total as null', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      // No success flag and a non-numeric total: only an explicit false is a failure.
      json: async () => ({ id: 'rf_9', refunded_amount_cents: '5000' }),
    })) as unknown as typeof fetch;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.refund({ transactionId: 'txn_4', amountCents: 5000 })).resolves.toEqual({
      id: 'rf_9',
      refundedAmountCents: null,
      success: true,
    });
  });

  it('throws AppError(502) when a 2xx refund response carries no id', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, refunded_amount_cents: 100 }),
    })) as unknown as typeof fetch;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.refund({ transactionId: 'txn_5', amountCents: 100 })).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
      message: 'Paymob refund response missing id.',
    });
  });

  it('throws AppError(502) on a non-OK response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ detail: 'already refunded' }),
    })) as unknown as typeof fetch;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.refund({ transactionId: 'txn_3', amountCents: 100 })).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
    });
  });
});
