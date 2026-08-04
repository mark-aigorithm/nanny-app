import { Router, type NextFunction, type Request, type Response } from 'express';

import { ok } from '@backend/lib/api-response';
import { routeIdParam } from '@backend/lib/route-param';
import { optionalAuth } from '@backend/middleware/auth.middleware';
import {
  listLiveCampaigns,
  recordClick,
  recordImpression,
} from '@backend/services/campaign.service';

export const campaignRouter = Router();

// Home is visible to guests, so campaigns are readable + trackable without auth.
campaignRouter.use(optionalAuth);

campaignRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listLiveCampaigns()));
  } catch (err) {
    next(err);
  }
});

campaignRouter.post('/:id/impression', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recordImpression(routeIdParam(req.params.id));
    res.json(ok({ recorded: true }));
  } catch (err) {
    next(err);
  }
});

campaignRouter.post('/:id/click', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recordClick(routeIdParam(req.params.id));
    res.json(ok({ recorded: true }));
  } catch (err) {
    next(err);
  }
});
