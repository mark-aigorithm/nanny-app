import type { NextFunction, Request, Response } from 'express';

import { firebaseAuth, type DecodedIdToken } from '@backend/lib/firebase';
import { errors } from '@backend/lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Decoded Firebase ID token, populated by `requireAuth`. */
      firebaseUser?: DecodedIdToken;
    }
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header against Firebase Admin
 * SDK and attaches the decoded token to `req.firebaseUser`. Throws 401 on
 * any failure — the global error handler maps it to a JSON response.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw errors.unauthorized('Missing or malformed Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) throw errors.unauthorized('Missing bearer token');

    const decoded = await firebaseAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch (err) {
    // verifyIdToken throws on expired/invalid tokens
    if (err instanceof Error && err.name !== 'AppError') {
      next(errors.unauthorized('Invalid or expired token'));
      return;
    }
    next(err);
  }
}

/**
 * Like `requireAuth`, but a request with no `Authorization` header continues
 * anonymously (`req.firebaseUser` stays undefined) — used by public read
 * endpoints that guest (not-yet-registered) users may browse. A header that
 * is present but malformed/invalid still fails with 401 so client auth bugs
 * surface instead of silently downgrading to anonymous data.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.headers.authorization) {
    next();
    return;
  }
  await requireAuth(req, res, next);
}
