import type { NextFunction, Request, Response } from 'express';

jest.mock('@backend/lib/firebase', () => ({
  firebaseAuth: { verifyIdToken: jest.fn() },
}));

import { firebaseAuth } from '@backend/lib/firebase';
import { requireAuth, requireFreshAuth } from '@backend/middleware/auth.middleware';

const mockVerifyIdToken = firebaseAuth.verifyIdToken as jest.Mock;
const res = {} as Response;

function buildReq(): Request {
  return { headers: { authorization: 'Bearer tok' } } as Request;
}

function firebaseError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

beforeEach(() => jest.clearAllMocks());

describe('requireFreshAuth', () => {
  it('asks Firebase to check revocation, and attaches the token when the session is live', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'fb-1' });
    const req = buildReq();
    const next = jest.fn() as NextFunction;

    await requireFreshAuth(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok', true);
    expect(req.firebaseUser).toEqual({ uid: 'fb-1' });
    expect(next).toHaveBeenCalledWith();
  });

  it.each(['auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'])(
    'tells a %s session it has ended',
    async (code) => {
      mockVerifyIdToken.mockRejectedValue(firebaseError(code));
      const next = jest.fn() as NextFunction;

      await requireFreshAuth(buildReq(), res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401, message: 'Your session has ended. Please sign in again.' }),
      );
    },
  );

  it('keeps the generic message for a token that is simply bad', async () => {
    mockVerifyIdToken.mockRejectedValue(firebaseError('auth/argument-error'));
    const next = jest.fn() as NextFunction;

    await requireFreshAuth(buildReq(), res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: 'Invalid or expired token' }),
    );
  });
});

describe('requireAuth', () => {
  it('still skips the revocation round-trip', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'fb-1' });
    await requireAuth(buildReq(), res, jest.fn() as NextFunction);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok');
  });
});
