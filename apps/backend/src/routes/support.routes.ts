import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { getSupportContact } from '@backend/services/support-contact.service';

export const supportRouter = Router();

supportRouter.use(requireAuth);

// A narrow, non-admin projection of the support contact settings, following
// the GET /bookings/options precedent — the app never reads an /admin route.
supportRouter.get('/contact', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getSupportContact()));
  } catch (err) {
    next(err);
  }
});
