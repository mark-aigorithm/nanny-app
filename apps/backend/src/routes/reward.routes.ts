import { Router, type NextFunction, type Request, type Response } from 'express';

import { RewardHistoryQuerySchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import {
  getMyHistory,
  getMyWallet,
  getRewardConfig,
} from '@backend/services/reward.service';

export const rewardRouter = Router();

rewardRouter.use(requireAuth);

// Program rates, so the app can show "X points = 1 free hour".
rewardRouter.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getRewardConfig()));
  } catch (err) {
    next(err);
  }
});

rewardRouter.get('/wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getMyWallet(req.firebaseUser.uid)));
  } catch (err) {
    next(err);
  }
});

rewardRouter.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const query = RewardHistoryQuerySchema.parse(req.query);
    const result = await getMyHistory(req.firebaseUser.uid, query);
    res.json({ data: result.entries, error: null, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

