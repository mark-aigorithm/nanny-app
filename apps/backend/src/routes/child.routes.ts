import { Router, type Request, type Response, type NextFunction } from 'express';

import { ChildInputSchema } from '@nanny-app/shared';

import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeIdParam } from '@backend/lib/route-param';
import {
  createMyChild,
  deleteMyChild,
  listMyChildren,
  updateMyChild,
} from '@backend/services/child.service';

/**
 * The signed-in mother's children (Profile → Children). A booking picks from
 * these by id and snapshots them, so nothing here changes a booking already
 * made. Mothers only — the service enforces it.
 */
export const childRouter = Router();

/** GET /children — oldest first. */
childRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await listMyChildren(req.firebaseUser)));
  } catch (err) {
    next(err);
  }
});

/** POST /children — returns the new child, so the booking picker can tick it. */
childRouter.post(
  '/',
  requireAuth,
  validateBody(ChildInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.status(201).json(ok(await createMyChild(req.firebaseUser, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/** PUT /children/:id — the whole child; the form always sends every field. */
childRouter.put(
  '/:id',
  requireAuth,
  validateBody(ChildInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await updateMyChild(req.firebaseUser, routeIdParam(req.params['id']), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /children/:id — soft delete; returns the children left. */
childRouter.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await deleteMyChild(req.firebaseUser, routeIdParam(req.params['id']))));
  } catch (err) {
    next(err);
  }
});
