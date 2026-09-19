import { Router, type Request, type Response, type NextFunction } from 'express';

import { AddressInputSchema, UpdateAddressSchema } from '@nanny-app/shared';

import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeIdParam } from '@backend/lib/route-param';
import {
  createMyAddress,
  deleteMyAddress,
  listMyAddresses,
  setMyDefaultAddress,
  updateMyAddress,
} from '@backend/services/address.service';

/**
 * The signed-in user's address book. Mothers read and write; a nanny only
 * reads (her one address is edited by support — the service enforces it).
 */
export const addressRouter = Router();

/** GET /addresses — default first, then oldest first. */
addressRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await listMyAddresses(req.firebaseUser)));
  } catch (err) {
    next(err);
  }
});

/** POST /addresses — the first one saved becomes the default automatically. */
addressRouter.post(
  '/',
  requireAuth,
  validateBody(AddressInputSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.status(201).json(ok(await createMyAddress(req.firebaseUser, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /addresses/:id — any subset of the fields; `isDefault: true` promotes. */
addressRouter.patch(
  '/:id',
  requireAuth,
  validateBody(UpdateAddressSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await updateMyAddress(req.firebaseUser, routeIdParam(req.params['id']), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/** POST /addresses/:id/default — returns the whole list, new default first. */
addressRouter.post(
  '/:id/default',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await setMyDefaultAddress(req.firebaseUser, routeIdParam(req.params['id']))));
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /addresses/:id — soft delete; returns the remaining list. */
addressRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await deleteMyAddress(req.firebaseUser, routeIdParam(req.params['id']))));
    } catch (err) {
      next(err);
    }
  },
);
