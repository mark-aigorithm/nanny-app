import { Router, type NextFunction, type Request, type Response } from 'express';

import { RegisterPushTokenSchema, RemovePushTokenSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { registerPushToken, removePushToken } from '@backend/services/device.service';

export const deviceRouter = Router();

deviceRouter.post(
  '/push-token',
  requireAuth,
  validateBody(RegisterPushTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await registerPushToken(req.firebaseUser, req.body);
      res.status(201).json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);

deviceRouter.delete(
  '/push-token',
  requireAuth,
  validateBody(RemovePushTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const result = await removePushToken(req.firebaseUser, req.body.token);
      res.json(ok(result));
    } catch (err) {
      next(err);
    }
  },
);
