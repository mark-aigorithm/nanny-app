import { Router, type Request, type Response, type NextFunction } from 'express';

import { CreateReviewSchema, NannyBookedSlotsQuerySchema, NannyListQuerySchema, UpdateNannyProfileRequestSchema } from '@nanny-app/shared';

import { optionalAuth, requireAuth } from '@backend/middleware/auth.middleware';
import { requireApprovedNanny } from '@backend/middleware/nanny.middleware';
import { validateBody, validateQuery } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import {
  createReview,
  getNannyBookedSlots,
  getNannyDashboard,
  getNannyProfile,
  getNannyPublicProfile,
  listNannies,
  updateNannyProfile,
} from '@backend/services/nanny.service';
import { listActiveSkills } from '@backend/services/skill.service';

export const nannyRouter = Router();

// ── Dashboard ─────────────────────────────────────────────────────────────────

nannyRouter.get(
  '/dashboard',
  requireAuth,
  requireApprovedNanny,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const data = await getNannyDashboard(req.firebaseUser);
      res.json(ok(data));
    } catch (err) { next(err); }
  },
);

// ── Self profile (authenticated nanny managing own profile) ───────────────────

nannyRouter.get(
  '/profile',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const profile = await getNannyProfile(req.firebaseUser);
      res.json(ok(profile));
    } catch (err) { next(err); }
  },
);

nannyRouter.put(
  '/profile',
  requireAuth,
  validateBody(UpdateNannyProfileRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const profile = await updateNannyProfile(req.firebaseUser, req.body);
      res.json(ok(profile));
    } catch (err) { next(err); }
  },
);

// ── Skill catalog (active skills, for the search filter) ──────────────────────

// The skill catalog and the nanny directory below are public reads: guests
// browsing without an account may see them (optionalAuth, no user data read).
nannyRouter.get(
  '/skills',
  optionalAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await listActiveSkills()));
    } catch (err) { next(err); }
  },
);

// ── Public nanny directory ────────────────────────────────────────────────────

nannyRouter.get(
  '/nannies',
  optionalAuth,
  validateQuery(NannyListQuerySchema),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await listNannies(res.locals['validatedQuery']);
      res.json({ data: result.nannies, error: null, meta: { total: result.total } });
    } catch (err) { next(err); }
  },
);

nannyRouter.get(
  '/nannies/:nannyProfileId',
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await getNannyPublicProfile(String(req.params['nannyProfileId']));
      res.json(ok(profile));
    } catch (err) { next(err); }
  },
);

nannyRouter.get(
  '/nannies/:nannyProfileId/booked-slots',
  optionalAuth,
  validateQuery(NannyBookedSlotsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const slots = await getNannyBookedSlots(
        String(req.params['nannyProfileId']),
        res.locals['validatedQuery'],
      );
      res.json(ok(slots));
    } catch (err) { next(err); }
  },
);

// ── Reviews (POST /nanny/bookings/:bookingId/review) ──────────────────────────

nannyRouter.post(
  '/bookings/:bookingId/review',
  requireAuth,
  validateBody(CreateReviewSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const review = await createReview(
        req.firebaseUser,
        String(req.params['bookingId']),
        req.body,
      );
      res.status(201).json(ok(review));
    } catch (err) { next(err); }
  },
);
