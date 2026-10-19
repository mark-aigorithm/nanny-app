import { AppVersionCheckQuerySchema, type AppVersionCheckQuery } from '@nanny-app/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { validateQuery } from '@backend/middleware/validate.middleware';
import { checkAppVersion } from '@backend/services/app-release.service';

export const appVersionRouter = Router();

// Public by design: the app checks before anyone signs in, and the answer
// (which versions are current) is not secret.
appVersionRouter.get(
  '/check',
  validateQuery(AppVersionCheckQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AppVersionCheckQuery;
      res.json(ok(await checkAppVersion(query)));
    } catch (err) {
      next(err);
    }
  },
);
