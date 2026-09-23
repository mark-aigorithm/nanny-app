import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import {
  beginRun,
  completeReset,
  describeAccount,
  purgeAccount,
} from '@backend/services/e2e-auth.service';

/**
 * Live-Firebase E2E harness. Mounted only when E2E_LIVE_AUTH_ENABLED is set —
 * never in production — and every operation is allowlisted to the two reserved
 * test numbers inside the service. See e2e-auth.service.ts.
 *
 * A device run must call POST /begin first: it establishes, server-side, that
 * both reserved numbers were clean before anything in this run gets created —
 * purge and complete-reset both refuse until it has.
 */
export const e2eAuthRouter = Router();

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw errors.badRequest(`${name} is required.`);
  }
  return value.trim();
}

e2eAuthRouter.post('/begin', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await beginRun()));
  } catch (err) {
    next(err);
  }
});

// Send the phone as `%2B201234567891` — Express's query parser decodes a
// literal `+` in a query string to a space (it's the `application/
// x-www-form-urlencoded` convention), and a phone with a space instead of a
// `+` fails the reserved-number check closed rather than open.
e2eAuthRouter.get('/account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await describeAccount(requiredString(req.query['phone'], 'phone'))));
  } catch (err) {
    next(err);
  }
});

e2eAuthRouter.post('/purge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await purgeAccount(requiredString(req.body?.phone, 'phone'))));
  } catch (err) {
    next(err);
  }
});

e2eAuthRouter.post('/complete-reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await completeReset(
      requiredString(req.body?.email, 'email'),
      requiredString(req.body?.newPassword, 'newPassword'),
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
