import { Router, type NextFunction, type Request, type Response } from 'express';

import { SetQaScenarioStatusSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  getQaChecklist,
  resetQaChecklist,
  setQaScenarioStatus,
} from '@backend/services/qa-checklist.service';

/**
 * The manual release-test checklist, read and written by the console's public
 * /qa page.
 *
 * Deliberately unauthenticated — the business team walks the release test
 * without admin accounts. Three things keep that safe:
 *
 *  1. The router is only mounted when QA_CHECKLIST_ENABLED is set, so the whole
 *     surface disappears from an environment by unsetting one variable.
 *  2. A write must name a scenario that exists in the shared catalogue, so it
 *     can only ever touch the ~100 keys the catalogue defines — no other
 *     app_settings row is reachable.
 *  3. The payload is Zod-validated with capped free-text, so the endpoint
 *     cannot be used as general-purpose storage.
 *
 * It holds no customer data and must never grow to read any.
 */
export const qaRouter = Router();

qaRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getQaChecklist()));
  } catch (err) {
    next(err);
  }
});

qaRouter.put(
  '/:scenarioId',
  validateBody(SetQaScenarioStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Express types a param as string | string[]; a repeated segment would
      // arrive as an array, which the catalogue lookup would reject anyway —
      // collapse it to something the allowlist can answer for.
      const raw = req.params['scenarioId'];
      const scenarioId = Array.isArray(raw) ? '' : (raw ?? '');
      res.json(ok(await setQaScenarioStatus(scenarioId, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

qaRouter.post('/reset', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cleared = await resetQaChecklist();
    res.json(ok({ cleared }));
  } catch (err) {
    next(err);
  }
});
