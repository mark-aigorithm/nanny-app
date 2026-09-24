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

/** What the client is told when the session behind a genuine token is over. */
const SESSION_ENDED = 'Your session has ended. Please sign in again.';

/**
 * Firebase codes meaning the token was real but its session is not: signed
 * out everywhere (a password or email change revokes), disabled by support, or
 * the account deleted. Only a revocation-checking verify raises them.
 */
const SESSION_ENDED_CODES = new Set([
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

function firebaseErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header against Firebase Admin
 * SDK and attaches the decoded token to `req.firebaseUser`. Throws 401 on
 * any failure — the global error handler maps it to a JSON response.
 *
 * `checkRevoked` costs a Firebase round-trip per request, so it is reserved
 * for the routes where a stale session must not act: creating an account, and
 * the admin console.
 */
function bearerAuth(checkRevoked: boolean) {
  return async function authenticate(
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

      req.firebaseUser = checkRevoked
        ? await firebaseAuth.verifyIdToken(token, true)
        : await firebaseAuth.verifyIdToken(token);
      next();
    } catch (err) {
      // verifyIdToken throws on expired/invalid/revoked tokens
      if (err instanceof Error && err.name !== 'AppError') {
        const code = firebaseErrorCode(err);
        next(
          errors.unauthorized(
            code && SESSION_ENDED_CODES.has(code) ? SESSION_ENDED : 'Invalid or expired token',
          ),
        );
        return;
      }
      next(err);
    }
  };
}

/** Any valid Firebase ID token. */
export const requireAuth = bearerAuth(false);

/** A valid Firebase ID token whose session has not been revoked or disabled since it was minted. */
export const requireFreshAuth = bearerAuth(true);

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
