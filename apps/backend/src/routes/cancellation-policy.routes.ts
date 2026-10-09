import { Router, type NextFunction, type Request, type Response } from 'express';

import { SetCancellationCellProposalSchema, SetCancellationDecisionSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  clearCancellationCellProposal,
  getCancellationCellProposals,
  setCancellationCellProposal,
} from '@backend/services/cancellation-cell-proposal.service';
import {
  clearCancellationDecision,
  getCancellationDecisions,
  setCancellationDecision,
} from '@backend/services/cancellation-policy.service';

/**
 * The business team's cancellation-policy choices, and the changes they
 * propose to single cells of the "What happens today" table — read and
 * written by the console's public /cancellation-flows page.
 *
 * Deliberately unauthenticated, and kept safe the same way as qa.routes.ts:
 *
 *  1. Mounted only when CANCELLATION_POLICY_BOARD_ENABLED is set.
 *  2. A write must name a decision and an option, or a scenario, a column and a
 *     choice, from the shared catalogues, so it can only touch the few dozen
 *     keys those define.
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

function decisionIdParam(req: Request): string {
  return param(req, 'decisionId');
}

// The /cells routes come first: their paths have more segments than
// /:decisionId, so they never clash, but reading them first keeps it obvious.
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
