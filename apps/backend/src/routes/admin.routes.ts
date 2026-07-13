import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  AdminBookingListQuerySchema,
  type AdminBookingListQuery,
  AdminListQuerySchema,
  type AdminListQuery,
  AdminNannyListQuerySchema,
  type AdminNannyListQuery,
  CreateAdminSchema,
  CreateCameraSchema,
  CreateDurationRuleSchema,
  CreatePromoCodeSchema,
  CreateSkillSchema,
  GrantPointsSchema,
  PricePreviewSchema,
  RewardHistoryQuerySchema,
  RewardWalletListQuerySchema,
  type RewardWalletListQuery,
  RejectAdminBookingSchema,
  RejectNannySchema,
  SetBookingStatusSchema,
  SetNannySkillsSchema,
  UpdateBookingTimesSchema,
  UpdateCameraSchema,
  UpdateDurationRuleSchema,
  UpdatePlatformConfigSchema,
  UpdatePromoCodeSchema,
  UpdateRewardConfigSchema,
  UpdateSkillSchema,
} from '@nanny-app/shared';

import { ok, okPaged } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeParam } from '@backend/lib/route-param';
import { requireAdmin, requireSuperuser } from '@backend/middleware/admin.middleware';
import { requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import {
  approveBooking,
  getAdminBooking,
  listAdminBookings,
  rejectBooking,
  setBookingStatus,
  updateBookingTimes,
} from '@backend/services/admin-booking.service';
import {
  approveNanny,
  getAdminNanny,
  listAdminNannies,
  rejectNanny,
  setNannySkills,
} from '@backend/services/admin-nanny.service';
import {
  createAdminUser,
  getAdminMother,
  getAdminProfile,
  listAdminMothers,
  listAdminUsers,
} from '@backend/services/admin-user.service';
import {
  getPlatformConfig,
  updatePlatformConfig,
} from '@backend/services/app-settings.service';
import {
  createDurationRule,
  deleteDurationRule,
  listDurationRules,
  updateDurationRule,
} from '@backend/services/duration-rule.service';
import { previewBreakdown } from '@backend/services/pricing-config.service';
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
import {
  getRewardConfig,
  getWalletHistory,
  getWalletSummary,
  grantPoints,
  listWallets,
  updateRewardConfig,
} from '@backend/services/reward.service';

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

adminRouter.get(
  '/bookings',
  validateQuery(AdminBookingListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = res.locals['validatedQuery'] as AdminBookingListQuery;
      const { bookings, meta } = await listAdminBookings(status, { page, limit });
      res.json(okPaged(bookings, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getAdminBooking(routeParam(req.params.id))));
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

adminRouter.get(
  '/nannies',
  validateQuery(AdminNannyListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = res.locals['validatedQuery'] as AdminNannyListQuery;
      const { nannies, meta } = await listAdminNannies(status, { page, limit });
      res.json(okPaged(nannies, meta));
    } catch (err) {
      next(err);
    }
  },
);

// Literal detail route registered before the parameterised action routes below.
adminRouter.get('/nannies/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getAdminNanny(routeParam(req.params.id))));
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

// ── Mothers directory (read-only list of parent accounts) ──────

adminRouter.get(
  '/mothers',
  validateQuery(AdminListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit } = res.locals['validatedQuery'] as AdminListQuery;
      const { mothers, meta } = await listAdminMothers({ page, limit });
      res.json(okPaged(mothers, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/mothers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getAdminMother(routeParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

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

// ── Duration multiplier rules ──────────────────────────────────

adminRouter.get('/duration-rules', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listDurationRules()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/duration-rules',
  validateBody(CreateDurationRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createDurationRule(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/duration-rules/:id',
  validateBody(UpdateDurationRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateDurationRule(routeParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/duration-rules/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteDurationRule(routeParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Pricing calculator (authoritative preview for the admin UI) ─

adminRouter.post(
  '/pricing/calculate',
  validateBody(PricePreviewSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await previewBreakdown(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

// ── Care Points (rewards) ──────────────────────────────────────

adminRouter.get(
  '/rewards/config',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await getRewardConfig()));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.put(
  '/rewards/config',
  validateBody(UpdateRewardConfigSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateRewardConfig(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/rewards/wallets',
  validateQuery(RewardWalletListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, search } = res.locals['validatedQuery'] as RewardWalletListQuery;
      const { wallets, meta } = await listWallets({ page, limit, search });
      res.json(okPaged(wallets, meta));
    } catch (err) {
      next(err);
    }
  },
);

// Registered before '/rewards/wallets/:userId' — the extra segment makes it
// distinct, but keep the more specific path first for clarity.
adminRouter.get(
  '/rewards/wallets/:userId/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = RewardHistoryQuerySchema.parse(req.query);
      const result = await getWalletHistory(routeParam(req.params.userId), query);
      res.json({ data: result.entries, error: null, meta: result.meta });
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get(
  '/rewards/wallets/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await getWalletSummary(routeParam(req.params.userId))));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/rewards/wallets/:userId/grant',
  validateBody(GrantPointsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const admin = await getAdminProfile(req.firebaseUser.uid);
      res.json(
        ok(
          await grantPoints({
            userId: routeParam(req.params.userId),
            points: req.body.points,
            reason: req.body.reason,
            adminId: admin.id,
          }),
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);
