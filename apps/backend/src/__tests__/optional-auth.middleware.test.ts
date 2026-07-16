import type { NextFunction, Request, Response } from 'express';

// auth.middleware imports firebaseAuth (→ config env validation) at module load;
// mock it so these tests stay hermetic and don't need real env vars.
jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));

import { firebaseAuth } from '@backend/lib/firebase';
import { AppError } from '@backend/lib/errors';
import { optionalAuth } from '@backend/middleware/auth.middleware';

const mockVerifyIdToken = firebaseAuth.verifyIdToken as jest.Mock;

function buildReq(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as Request;
}

const res = {} as Response;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('optionalAuth', () => {
  it('continues anonymously when no Authorization header is present', async () => {
    const req = buildReq();
    const next = jest.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.firebaseUser).toBeUndefined();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('attaches the decoded token when a valid bearer token is sent', async () => {
    const decoded = { uid: 'firebase-1' };
    mockVerifyIdToken.mockResolvedValue(decoded);
    const req = buildReq('Bearer good-token');
    const next = jest.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('good-token');
    expect(req.firebaseUser).toEqual(decoded);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects an invalid or expired token with 401', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));
    const req = buildReq('Bearer bad-token');
    const next = jest.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AppError>>({ statusCode: 401 }),
    );
    expect(req.firebaseUser).toBeUndefined();
  });

  it('rejects a malformed Authorization header with 401', async () => {
    const req = buildReq('Basic abc123');
    const next = jest.fn() as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining<Partial<AppError>>({ statusCode: 401 }),
    );
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});
