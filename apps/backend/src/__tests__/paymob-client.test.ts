import { createPaymobApiClient } from '@backend/lib/paymob/client';
import { AppError } from '@backend/lib/errors';
import type { PaymobIntentionCreateBody } from '@backend/lib/paymob/types';

/**
 * The intention + inquiry halves of the Paymob HTTP client (refunds live in
 * paymob-refund-client.test.ts). Every failure Paymob can hand back — a non-OK
 * status, an unreadable body, a 2xx missing the fields we need — must surface
 * as an AppError(502), never as a half-parsed result the payment flow trusts.
 */

type FakeResponse = {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

const realFetch = global.fetch;
let fetchMock: jest.Mock;

function respondWith(res: FakeResponse) {
  fetchMock = jest.fn(async () => res);
  global.fetch = fetchMock as unknown as typeof fetch;
}

function okJson(body: unknown): FakeResponse {
  return { ok: true, status: 200, json: async () => body };
}

function errorText(text: string, statusText = 'Bad Request'): FakeResponse {
  return { ok: false, status: 400, statusText, text: async () => text };
}

const intentionBody: PaymobIntentionCreateBody = {
  amount: 31_800,
  currency: 'EGP',
  payment_methods: [1],
  billing_data: { first_name: 'Mona' },
  merchant_order_id: '8',
  special_reference: '8',
  notification_url: 'https://api.test/webhooks/paymob',
};

afterEach(() => {
  global.fetch = realFetch;
});

describe('createIntention', () => {
  it('POSTs the body to /v1/intention/ with the secret key, stripping a trailing slash from the base', async () => {
    respondWith(okJson({ id: 'int_1', client_secret: 'cs_1' }));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com/');
    const result = await api.createIntention(intentionBody);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://accept.paymob.com/v1/intention/');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Token sk_test', 'Content-Type': 'application/json' });
    // Amounts go to Paymob in cents, untouched by the client.
    expect(JSON.parse(init.body as string)).toEqual(intentionBody);
    expect(result).toEqual({ id: 'int_1', client_secret: 'cs_1' });
  });

  it('accepts a numeric intention id and returns it as a string', async () => {
    respondWith(okJson({ id: 4242, client_secret: 'cs_1' }));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).resolves.toEqual({ id: '4242', client_secret: 'cs_1' });
  });

  it('falls back to the legacy `client_secrete` spelling when client_secret is absent', async () => {
    respondWith(okJson({ id: 'int_1', client_secrete: 'cs_legacy' }));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).resolves.toEqual({
      id: 'int_1',
      client_secret: 'cs_legacy',
    });
  });

  it('rejects a 2xx response with no id', async () => {
    respondWith(okJson({ client_secret: 'cs_1' }));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
      message: 'Paymob intention response missing id.',
    });
  });

  it.each([
    ['missing', {}],
    ['empty', { client_secret: '' }],
    ['not a string', { client_secret: 123 }],
  ])('rejects a 2xx response whose client_secret is %s', async (_label, extra) => {
    respondWith(okJson({ id: 'int_1', ...extra }));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toMatchObject({
      statusCode: 502,
      message: 'Paymob intention response missing client_secret.',
    });
  });

  it("surfaces Paymob's JSON `detail` as the error message", async () => {
    respondWith(errorText(JSON.stringify({ detail: 'amount must be >= 1' })));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toMatchObject({
      statusCode: 502,
      message: 'Paymob intention failed: amount must be >= 1',
    });
  });

  it('falls back to a JSON `message` when there is no `detail`', async () => {
    respondWith(errorText(JSON.stringify({ message: 'invalid integration' })));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toThrow(
      'Paymob intention failed: invalid integration',
    );
  });

  it('uses the raw JSON text when it carries neither `detail` nor `message`', async () => {
    respondWith(errorText(JSON.stringify({ code: 7 })));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toThrow('Paymob intention failed: {"code":7}');
  });

  it('uses the raw body when the error is not JSON (an HTML gateway page)', async () => {
    respondWith(errorText('<html>502 Bad Gateway</html>'));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toThrow(
      'Paymob intention failed: <html>502 Bad Gateway</html>',
    );
  });

  it('uses the status text when the error body is empty', async () => {
    respondWith(errorText('', 'Service Unavailable'));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toThrow(
      'Paymob intention failed: Service Unavailable',
    );
  });

  it('uses the status text when the error body cannot be read at all', async () => {
    respondWith({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => {
        throw new Error('socket hang up');
      },
    });

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toMatchObject({
      statusCode: 502,
      message: 'Paymob intention failed: Internal Server Error',
    });
  });

  it('lets a network failure (timeout, DNS) propagate as-is for the caller to unwind', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.createIntention(intentionBody)).rejects.toThrow('fetch failed');
  });
});

describe('getIntentionElement', () => {
  it('GETs the public element endpoint with the key and secret URL-encoded', async () => {
    const element = { status: 'intended', transactions: [] };
    respondWith(okJson(element));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    const result = await api.getIntentionElement('pk/live', 'cs ?&');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://accept.paymob.com/v1/intention/element/pk%2Flive/cs%20%3F%26/');
    expect(init.method).toBe('GET');
    // The public read is unauthenticated — the secret key must never be sent on it.
    expect(init.headers).toBeUndefined();
    expect(result).toEqual(element);
  });

  it('throws AppError(502) with the Paymob error on a non-OK response', async () => {
    respondWith(errorText(JSON.stringify({ detail: 'Not found.' }), 'Not Found'));

    const api = createPaymobApiClient('sk_test', 'https://accept.paymob.com');
    await expect(api.getIntentionElement('pk', 'cs')).rejects.toMatchObject({
      constructor: AppError,
      statusCode: 502,
      message: 'Paymob intention inquiry failed: Not found.',
    });
  });
});
