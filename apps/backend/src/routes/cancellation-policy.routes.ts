import { Router, type NextFunction, type Request, type Response } from 'express';

import { SetCancellationCellProposalSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  clearCancellationCellProposal,
  getCancellationCellProposals,
  setCancellationCellProposal,
} from '@backend/services/cancellation-cell-proposal.service';

/**
 * The changes the business team proposes to single cells of the "What happens
 * today" table — read and written by the console's public /cancellation-flows
 * page.
 *
 * Deliberately unauthenticated, and kept safe the same way as qa.routes.ts:
 *
 *  1. Mounted only when CANCELLATION_POLICY_BOARD_ENABLED is set.
 *  2. A write must name a scenario, a column and a choice from the shared
 *     catalogue, so it can only touch the few dozen keys it defines.
 *  3. The payload is Zod-validated with capped free text.
 *
 * It holds no customer data and must never grow to read any.
 */
export const cancellationPolicyRouter = Router();

/** Express types a param as string | string[]; collapse an array to an id the allowlist refuses. */
function param(req: Request, name: string): string {
  const raw = req.params[name];
  return Array.isArray(raw) ? '' : (raw ?? '');
}

cancellationPolicyRouter.get('/cells', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getCancellationCellProposals()));
  } catch (err) {
    next(err);
  }
});

cancellationPolicyRouter.put(
  '/cells/:flowId/:outcome',
  validateBody(SetCancellationCellProposalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(
        ok(await setCancellationCellProposal(param(req, 'flowId'), param(req, 'outcome'), req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

cancellationPolicyRouter.delete(
  '/cells/:flowId/:outcome',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await clearCancellationCellProposal(param(req, 'flowId'), param(req, 'outcome'));
      res.json(ok({ cleared: true }));
    } catch (err) {
      next(err);
    }
  },
);
