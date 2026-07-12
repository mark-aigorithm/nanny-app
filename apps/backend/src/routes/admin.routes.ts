import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  AdminBookingStatusFilterSchema,
  AdminNannyStatusFilterSchema,
  CreateAdminSchema,
  CreateCameraSchema,
  CreatePromoCodeSchema,
  CreateSkillSchema,
  RejectAdminBookingSchema,
  RejectNannySchema,
  SetBookingStatusSchema,
  SetNannySkillsSchema,
  UpdateBookingTimesSchema,
  UpdateCameraSchema,
  UpdatePlatformConfigSchema,
  UpdatePromoCodeSchema,
  UpdateSkillSchema,
} from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeParam } from '@backend/lib/route-param';
import { requireAdmin, requireSuperuser } from '@backend/middleware/admin.middleware';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import {
  approveBooking,
  listAdminBookings,
  rejectBooking,
  setBookingStatus,
  updateBookingTimes,
} from '@backend/services/admin-booking.service';
import {
  approveNanny,
  listAdminNannies,
  rejectNanny,
  setNannySkills,
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
  createCamera,
  deleteCamera,
  listCameras,
  listNannyOptions,
  updateCamera,
} from '@backend/services/camera.service';
import {
  createPromoCode,
  deletePromoCode,
  listPromoCodes,
  updatePromoCode,
} from '@backend/services/promo-code.service';
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
} from '@backend/services/skill.service';

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
  '/bookings/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await approveBooking(routeParam(req.params.id), req.firebaseUser.uid)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/bookings/:id/reject',
  validateBody(RejectAdminBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await rejectBooking(routeParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/bookings/:id/status',
  validateBody(SetBookingStatusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await setBookingStatus(routeParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/bookings/:id/times',
  validateBody(UpdateBookingTimesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await updateBookingTimes(routeParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
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

adminRouter.put(
  '/nannies/:id/skills',
  validateBody(SetNannySkillsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await setNannySkills(routeParam(req.params.id), req.body)));
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

// ── Skills (nanny specialty catalog) ───────────────────────────

adminRouter.get('/skills', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listSkills()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/skills',
  validateBody(CreateSkillSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createSkill(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/skills/:id',
  validateBody(UpdateSkillSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateSkill(routeParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/skills/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteSkill(routeParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Cameras ────────────────────────────────────────────────────

// Registered before the parameterised routes so the literal path wins.
adminRouter.get(
  '/cameras/nanny-options',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await listNannyOptions()));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/cameras', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listCameras()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/cameras',
  validateBody(CreateCameraSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createCamera(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/cameras/:id',
  validateBody(UpdateCameraSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateCamera(routeParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/cameras/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteCamera(routeParam(req.params.id))));
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
