import { Router, type NextFunction, type Request, type Response } from 'express';

import { PurchasePackageSchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeIdParam } from '@backend/lib/route-param';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { getMyPackageHours } from '@backend/services/package-hours.service';
import {
  createPaymobIntentionForPackagePurchase,
  syncPaymobPaymentForPackagePurchase,
} from '@backend/services/package-payment.service';
import {
  createPackagePurchase,
  listActivePackages,
} from '@backend/services/package-purchase.service';

export const packageRouter = Router();

packageRouter.use(requireAuth);

// Catalog a parent can actually buy from: active, and not past its offer end date.
packageRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listActivePackages()));
  } catch (err) {
    next(err);
  }
});

// Remaining prepaid hours plus the per-purchase buckets and their expiries.
// Registered before `/:id/...` so "me" is never parsed as a package id.
packageRouter.get('/me/hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getMyPackageHours(req.firebaseUser.uid)));
  } catch (err) {
    next(err);
  }
});

/**
 * Post-checkout poll, mirroring POST /bookings/:id/pay/paymob/sync. The mobile
 * app calls this when the Paymob WebView returns so settlement never depends
 * solely on the webhook arriving. Registered before `/:id/purchase` so
 * "purchases" is not swallowed as a package id.
 */
packageRouter.post(
  '/purchases/:id/sync',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const purchaseId = routeIdParam(req.params.id);
      res.json(ok(await syncPaymobPaymentForPackagePurchase(req.firebaseUser, purchaseId)));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Start a purchase: snapshot the package into a PENDING_PAYMENT row, then open a
 * Paymob intention against it. Returns the checkout session the app hands to the
 * Paymob WebView. Hours are only credited once that payment is captured.
 */
packageRouter.post(
  '/:id/purchase',
  validateBody(PurchasePackageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const packageId = routeIdParam(req.params.id);
      // The id is in the path and the body; refuse rather than silently trusting one.
      if (req.body.packageId !== packageId) {
        throw errors.badRequest('packageId in the body must match the id in the path.');
      }
      const { purchaseId } = await createPackagePurchase(req.firebaseUser.uid, req.body);
      const session = await createPaymobIntentionForPackagePurchase(
        req.firebaseUser,
        purchaseId,
      );
      res.status(201).json(ok({ ...session, purchaseId }));
    } catch (err) {
      next(err);
    }
  },
);
