import { Router, type NextFunction, type Request, type Response } from 'express';

import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { recordMyAppOpen } from '@backend/services/app-open.service';

/** The signed-in user's own activity signals. */
export const meRouter = Router();

/**
 * POST /me/app-open
 * The app calls this on cold start and whenever it returns to the foreground
 * (throttled to once per 5 minutes on the device). 204, no body.
 */
meRouter.post('/app-open', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    await recordMyAppOpen(req.firebaseUser);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
