import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  AdminBookingStatusFilterSchema,
  AdminNannyStatusFilterSchema,
  CreateAdminSchema,
  CreatePromoCodeSchema,
  RejectNannySchema,
  UpdatePlatformConfigSchema,
  UpdatePromoCodeSchema,
} from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeParam } from '@backend/lib/route-param';
import { requireAdmin, requireSuperuser } from '@backend/middleware/admin.middleware';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  confirmAdminBooking,
  listAdminBookings,
} from '@backend/services/admin-booking.service';
import {
  approveNanny,
  listAdminNannies,
  rejectNanny,
} from '@backend/services/admin-nanny.service';
import {
  createAdminUser,
  getAdminProfile,
  listAdminUsers,
} from '@backend/services/admin-user.service';
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

// ── Current admin (role drives UI visibility) ─────────────────

adminRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getAdminProfile(req.firebaseUser.uid)));
  } catch (err) {
    next(err);
  }
});

// ── Bookings ───────────────────────────────────────────────────

adminRouter.get('/bookings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = AdminBookingStatusFilterSchema.catch('ALL').parse(req.query.status);
    res.json(ok(await listAdminBookings(status)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/bookings/:id/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await confirmAdminBooking(routeParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Nanny review queue (new nanny registrations / KYC) ────────

adminRouter.get('/nannies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = AdminNannyStatusFilterSchema.catch('PENDING_REVIEW').parse(
      req.query.status,
    );
    res.json(ok(await listAdminNannies(status)));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/nannies/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await approveNanny(routeParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/nannies/:id/reject',
  validateBody(RejectNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await rejectNanny(routeParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

// ── Admin accounts (superuser only) ────────────────────────────

adminRouter.get(
  '/admins',
  requireSuperuser,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await listAdminUsers()));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/admins',
  requireSuperuser,
  validateBody(CreateAdminSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createAdminUser(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

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
