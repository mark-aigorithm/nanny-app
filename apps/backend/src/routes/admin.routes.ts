import { Router, type NextFunction, type Request, type Response } from 'express';

import {
  AdminBookingListQuerySchema,
  type AdminBookingListQuery,
  AdminEditBookingSchema,
  AdminEditBookingCommitSchema,
  AdminRefundBookingSchema,
  AdminIdReviewListQuerySchema,
  type AdminIdReviewListQuery,
  AdminMarketplaceListQuerySchema,
  type AdminMarketplaceListQuery,
  AdminMotherListQuerySchema,
  type AdminMotherListQuery,
  AdminNannyListQuerySchema,
  type AdminNannyListQuery,
  AdminPackagePurchaseListQuerySchema,
  type AdminPackagePurchaseListQuery,
  CreateAdminSchema,
  CreateCameraSchema,
  CreateCampaignSchema,
  CreateCertificationSchema,
  CreateOfficialListingSchema,
  CreatePackageSchema,
  CreateDurationRuleSchema,
  CreatePromoCodeSchema,
  CreateSkillSchema,
  GrantPointsSchema,
  PricePreviewSchema,
  RewardHistoryQuerySchema,
  RewardWalletListQuerySchema,
  type RewardWalletListQuery,
  RejectAdminBookingSchema,
  RejectListingSchema,
  RejectNannySchema,
  SetBookingStatusSchema,
  SetNannySkillsSchema,
  UpdateAdminMotherSchema,
  UpdateAdminNannySchema,
  UpdateAdminUserSchema,
  UpdateBookingTimesSchema,
  UpdateCameraSchema,
  UpdateDurationRuleSchema,
  UpdatePlatformConfigSchema,
  UpdatePromoCodeSchema,
  UpdateCampaignSchema,
  UpdateCertificationSchema,
  UpdateOfficialListingSchema,
  UpdatePackageSchema,
  UpdateRewardConfigSchema,
  UpdateSkillSchema,
  UpdateSupportContactSchema,
} from '@nanny-app/shared';

import { ok, okPaged } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { routeIdParam } from '@backend/lib/route-param';
import {
  requireAdmin,
  requireSectionAccess,
  requireSuperuser,
} from '@backend/middleware/admin.middleware';
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
  applyBookingEdit,
  getBookingEditContext,
  previewBookingEdit,
  refundBooking,
} from '@backend/services/admin-booking-edit.service';
import {
  approveNanny,
  getAdminNanny,
  listAdminNannies,
  rejectNanny,
  setNannySkills,
  updateAdminNanny,
} from '@backend/services/admin-nanny.service';
import { listIdReviews } from '@backend/services/admin-id-review.service';
import {
  approveListing,
  createOfficialListing,
  deleteOfficialListing,
  listMarketplaceListings,
  rejectListing,
  updateOfficialListing,
} from '@backend/services/admin-marketplace.service';
import {
  getPackagePurchaseDetail,
  listPackagePurchases,
} from '@backend/services/admin-package-purchase.service';
import {
  approveMother,
  createAdminUser,
  deleteAdminUser,
  getAdminMother,
  getAdminProfile,
  listAdminMothers,
  listAdminUsers,
  rejectMother,
  updateAdminMother,
  updateAdminUser,
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
  createCampaign,
  deleteCampaign,
  listCampaigns,
  updateCampaign,
} from '@backend/services/campaign.service';
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
} from '@backend/services/skill.service';
import {
  createCertification,
  deleteCertification,
  listCertifications,
  updateCertification,
} from '@backend/services/certification.service';
import {
  createPackage,
  deletePackage,
  listPackages,
  updatePackage,
} from '@backend/services/package.service';
import {
  getRewardConfig,
  getWalletHistory,
  getWalletSummary,
  grantPoints,
  listWallets,
  updateRewardConfig,
} from '@backend/services/reward.service';
import {
  getSupportContact,
  updateSupportContact,
} from '@backend/services/support-contact.service';

export const adminRouter = Router();

// Every admin endpoint is gated here: authenticated → holds a console role →
// holds the privilege its route declares in `lib/admin-permissions.ts`. That
// last check is deny-by-default, so a route added without a declared privilege
// is unreachable rather than open.
adminRouter.use(requireAuth, requireAdmin, requireSectionAccess);

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
    res.json(ok(await getAdminBooking(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/bookings/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await approveBooking(routeIdParam(req.params.id), req.firebaseUser.uid)));
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
        ok(await rejectBooking(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
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
        ok(await setBookingStatus(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
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
        ok(await updateBookingTimes(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── Full booking editor (edit inputs → re-price → settle money) ──

adminRouter.get('/bookings/:id/edit/context', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getBookingEditContext(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/bookings/:id/edit/preview',
  validateBody(AdminEditBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await previewBookingEdit(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/bookings/:id/edit',
  validateBody(AdminEditBookingCommitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await applyBookingEdit(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
      );
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/bookings/:id/refund',
  validateBody(AdminRefundBookingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await refundBooking(routeIdParam(req.params.id), req.firebaseUser.uid, req.body)),
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
    res.json(ok(await getAdminNanny(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch(
  '/nannies/:id',
  validateBody(UpdateAdminNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateAdminNanny(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/nannies/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await approveNanny(routeIdParam(req.params.id))));
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
      res.json(ok(await rejectNanny(routeIdParam(req.params.id), req.body)));
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
      res.json(ok(await setNannySkills(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

// ── Mothers directory (parent accounts: list, detail, edit + ID review) ────

adminRouter.get(
  '/mothers',
  validateQuery(AdminMotherListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = res.locals['validatedQuery'] as AdminMotherListQuery;
      const { mothers, meta } = await listAdminMothers(status, { page, limit });
      res.json(okPaged(mothers, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/mothers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getAdminMother(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch(
  '/mothers/:id',
  validateBody(UpdateAdminMotherSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateAdminMother(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/mothers/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await approveMother(routeIdParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/mothers/:id/reject',
  validateBody(RejectNannySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await rejectMother(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

// ── Combined ID review queue (parents + nannies, one KYC gallery) ──

adminRouter.get(
  '/id-reviews',
  validateQuery(AdminIdReviewListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AdminIdReviewListQuery;
      const { reviews, meta } = await listIdReviews(query);
      res.json(okPaged(reviews, meta));
    } catch (err) {
      next(err);
    }
  },
);

// ── Marketplace moderation ─────────────────────────────────────

adminRouter.get(
  '/marketplace/listings',
  validateQuery(AdminMarketplaceListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, page, limit } = res.locals[
        'validatedQuery'
      ] as AdminMarketplaceListQuery;
      const { listings, meta } = await listMarketplaceListings(status, { page, limit });
      res.json(okPaged(listings, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/marketplace/listings',
  validateBody(CreateOfficialListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const listing = await createOfficialListing(req.body, req.firebaseUser.uid);
      res.status(201).json(ok(listing));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/marketplace/listings/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await approveListing(routeIdParam(req.params.id), req.firebaseUser.uid)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.post(
  '/marketplace/listings/:id/reject',
  validateBody(RejectListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(
        ok(await rejectListing(routeIdParam(req.params.id), req.body, req.firebaseUser.uid)),
      );
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/marketplace/listings/:id',
  validateBody(UpdateOfficialListingSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateOfficialListing(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/marketplace/listings/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteOfficialListing(routeIdParam(req.params.id));
      res.json(ok({ deleted: true }));
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

adminRouter.patch(
  '/admins/:id',
  requireSuperuser,
  validateBody(UpdateAdminUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateAdminUser(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/admins/:id',
  requireSuperuser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.adminUser) throw errors.unauthorized();
      await deleteAdminUser(routeIdParam(req.params.id), req.adminUser.id);
      res.json(ok({ success: true }));
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
      res.json(ok(await updatePromoCode(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/promo-codes/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deletePromoCode(routeIdParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Campaigns (Home-screen promo carousel) ─────────────────────

adminRouter.get('/campaigns', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listCampaigns()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/campaigns',
  validateBody(CreateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createCampaign(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/campaigns/:id',
  validateBody(UpdateCampaignSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateCampaign(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete('/campaigns/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await deleteCampaign(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});

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
      res.json(ok(await updateSkill(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/skills/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteSkill(routeIdParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Certifications (nanny credential catalog) ──────────────────

adminRouter.get('/certifications', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listCertifications()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/certifications',
  validateBody(CreateCertificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createCertification(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/certifications/:id',
  validateBody(UpdateCertificationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updateCertification(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/certifications/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteCertification(routeIdParam(req.params.id))));
    } catch (err) {
      next(err);
    }
  },
);

// ── Packages (purchasable hour bundles, EGP) ───────────────────

adminRouter.get('/packages', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await listPackages()));
  } catch (err) {
    next(err);
  }
});

adminRouter.post(
  '/packages',
  validateBody(CreatePackageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(ok(await createPackage(req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.patch(
  '/packages/:id',
  validateBody(UpdatePackageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await updatePackage(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/packages/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deletePackage(routeIdParam(req.params.id))));
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
      res.json(ok(await updateCamera(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/cameras/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteCamera(routeIdParam(req.params.id))));
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

adminRouter.get('/support-contact', async (_req, res, next) => {
  try {
    res.json(ok(await getSupportContact()));
  } catch (err) {
    next(err);
  }
});

adminRouter.put(
  '/support-contact',
  validateBody(UpdateSupportContactSchema),
  async (req, res, next) => {
    try {
      res.json(ok(await updateSupportContact(req.body)));
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
      res.json(ok(await updateDurationRule(routeIdParam(req.params.id), req.body)));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.delete(
  '/duration-rules/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await deleteDurationRule(routeIdParam(req.params.id))));
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
      const result = await getWalletHistory(routeIdParam(req.params.userId), query);
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
      res.json(ok(await getWalletSummary(routeIdParam(req.params.userId))));
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
            userId: routeIdParam(req.params.userId),
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

// ── Package purchases (parent hour bundles — read-only) ────────
adminRouter.get(
  '/package-purchases',
  validateQuery(AdminPackagePurchaseListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const query = res.locals['validatedQuery'] as AdminPackagePurchaseListQuery;
      const { purchases, meta } = await listPackagePurchases(query);
      res.json(okPaged(purchases, meta));
    } catch (err) {
      next(err);
    }
  },
);

adminRouter.get('/package-purchases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(ok(await getPackagePurchaseDetail(routeIdParam(req.params.id))));
  } catch (err) {
    next(err);
  }
});
