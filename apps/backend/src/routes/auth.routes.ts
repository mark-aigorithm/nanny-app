import { Router, type Request, type Response, type NextFunction } from 'express';

import { RegisterRequestSchema } from '@nanny-app/shared';

import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { registerUser, getMe } from '@backend/services/auth.service';

export const authRouter = Router();

/**
 * POST /auth/register
 * Called once at the end of the mobile registration wizard, after the
 * Firebase account has been created and the phone number linked.
 * Idempotent — safe to retry.
 */
authRouter.post(
  '/register',
  requireAuth,
  validateBody(RegisterRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const user = await registerUser(req.firebaseUser, req.body);
      res.status(201).json(ok(user));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /auth/me
 * Returns the application User row for the current Firebase user. The
 * mobile client calls this on app launch / sign-in to hydrate its profile
 * store. A 404 means the Firebase user exists but the registration wizard
 * never finished — the client should send the user back to /auth/register.
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const user = await getMe(req.firebaseUser);
    res.json(ok(user));
  } catch (err) {
    next(err);
  }
});
