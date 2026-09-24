// jest.setup.js stubs `api`; these tests need the real helpers only, which the
// stub already re-exports — but unmock anyway so nothing here depends on it.
jest.unmock('@mobile/lib/api');

import { AxiosError, AxiosHeaders } from 'axios';

import { ApiRequestError, apiStatusOf, isNotFound, unwrap, unwrapPaginated } from '@mobile/lib/api';

function axiosError(status: number, error: string | null = null): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data: { data: null, error },
  });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

describe('unwrap', () => {
  it.each([404, 409, 500])('throws an ApiRequestError carrying a %i', async (status) => {
    const err = await caught(unwrap(Promise.reject(axiosError(status, 'No such thing'))));

    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(status);
  });

  it('keeps the user-facing message', async () => {
    const err = await caught(unwrap(Promise.reject(axiosError(404, 'User not registered'))));
    expect((err as ApiRequestError).message).toBe('User not registered');
  });

  it('gives an error envelope on a 2xx response a null status', async () => {
    const err = await caught(unwrap(Promise.resolve({ data: { data: null, error: 'Nope' } })));

    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBeNull();
    expect((err as ApiRequestError).message).toBe('Nope');
  });

  it('gives a failure with no response a null status', async () => {
    const config = { headers: new AxiosHeaders() };
    const offline = new AxiosError('Network Error', 'ERR_NETWORK', config);
    const err = await caught(unwrap(Promise.reject(offline)));
    expect((err as ApiRequestError).status).toBeNull();
  });

  it('returns the data on success', async () => {
    await expect(unwrap(Promise.resolve({ data: { data: { id: 1 }, error: null } }))).resolves.toEqual({ id: 1 });
  });
});

describe('unwrapPaginated', () => {
  it('carries the status', async () => {
    const err = await caught(unwrapPaginated(Promise.reject(axiosError(500))));
    expect((err as ApiRequestError).status).toBe(500);
  });

  it('gives an error envelope a null status', async () => {
    const err = await caught(unwrapPaginated(Promise.resolve({ data: { data: null, error: 'Nope' } })));
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBeNull();
  });
});

describe('apiStatusOf / isNotFound', () => {
  it('reads an ApiRequestError', () => {
    expect(apiStatusOf(new ApiRequestError('x', 409))).toBe(409);
    expect(isNotFound(new ApiRequestError('x', 404))).toBe(true);
    expect(isNotFound(new ApiRequestError('x', null))).toBe(false);
  });

  it('reads a raw axios error', () => {
    expect(apiStatusOf(axiosError(500))).toBe(500);
    expect(isNotFound(axiosError(404))).toBe(true);
    expect(isNotFound(axiosError(403))).toBe(false);
  });

  it('is null / false for anything else', () => {
    expect(apiStatusOf(new Error('not found'))).toBeNull();
    expect(isNotFound(new Error('Not found'))).toBe(false);
    expect(apiStatusOf(undefined)).toBeNull();
  });
});
