import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  CreatePromoCodeSchema,
  UpdatePlatformConfigSchema,
  UpdatePromoCodeSchema,
} from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { routeParam } from '@backend/lib/route-param';
import { requireAdmin } from '@backend/middleware/admin.middleware';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  getPlatformConfig,
  updatePlatformConfig,
} from '@backend/services/app-settings.service';
import {
  createPromoCode,
  deletePromoCode,
  listPromoCodes,
  updatePromoCode,
} from '@backend/services/promo-code.service';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

// ── Promo codes ────────────────────────────────────────────────

adminRouter.get('/promo-codes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listPromoCodes()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/promo-codes',
  validateBody(CreatePromoCodeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createPromoCode(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/promo-codes/:id',
  validateBody(UpdatePromoCodeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updatePromoCode(routeParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/promo-codes/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deletePromoCode(routeParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Platform configuration ─────────────────────────────────────

adminRouter.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getPlatformConfig()));
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/config',
  validateBody(UpdatePlatformConfigSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updatePlatformConfig(req.body)));
    } catch (err) {
      next(err);
    }
  },
);
