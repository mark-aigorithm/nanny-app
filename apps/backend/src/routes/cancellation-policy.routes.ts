import { Router, type NextFunction, type Request, type Response } from 'express';

import { SetCancellationDecisionSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  clearCancellationDecision,
  getCancellationDecisions,
  setCancellationDecision,
} from '@backend/services/cancellation-policy.service';

/**
 * The business team's cancellation-policy choices, read and written by the
 * console's public /cancellation-flows page.
 *
 * Deliberately unauthenticated, and kept safe the same way as qa.routes.ts:
 *
 *  1. Mounted only when CANCELLATION_POLICY_BOARD_ENABLED is set.
 *  2. A write must name a decision and an option from the shared catalogue, so
 *     it can only touch the dozen keys the catalogue defines.
 *  3. The payload is Zod-validated with capped free text.
 *
 * It holds no customer data and must never grow to read any.
 */
export const cancellationPolicyRouter = Router();

/** Express types a param as string | string[]; collapse an array to an id the allowlist refuses. */
function decisionIdParam(req: Request): string {
  const raw = req.params['decisionId'];
  return Array.isArray(raw) ? '' : (raw ?? '');
}

cancellationPolicyRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getCancellationDecisions()));
  } catch (err) {
    next(err);
  }
});

cancellationPolicyRouter.put(
  '/:decisionId',
  validateBody(SetCancellationDecisionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await setCancellationDecision(decisionIdParam(req), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

cancellationPolicyRouter.delete(
  '/:decisionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await clearCancellationDecision(decisionIdParam(req));
      res.json(ok({ cleared: true }));
    } catch (err) {
      next(err);
    }
  },
);
