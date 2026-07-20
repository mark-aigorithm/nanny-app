import { Router, type NextFunction, type Request, type Response } from 'express';

import { RedeemReferralSchema, ValidateReferralCodeQuerySchema } from '@nanny-app/shared';

import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import { requireAuth } from '@backend/middleware/auth.middleware';
import {
  getReferralSummary,
  redeemReferralCode,
  validateReferralCode,
} from '@backend/services/referral.service';

export const referralRouter = Router();

referralRouter.use(requireAuth);

// Code, share text, payout amounts and invite list for the Refer a friend screen.
referralRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getReferralSummary(req.firebaseUser.uid)));
  } catch (err) {
    next(err);
  }
});

// Pre-submit check, so the signup field can confirm who invited the user.
referralRouter.get('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const { code } = ValidateReferralCodeQuerySchema.parse(req.query);
    res.json(ok(await validateReferralCode(req.firebaseUser.uid, code)));
  } catch (err) {
    next(err);
  }
});

// Called by the app right after signup succeeds. The service — not the client's
// call ordering — is what enforces that the account is still new.
referralRouter.post('/redeem', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const { code } = RedeemReferralSchema.parse(req.body);
    res.json(ok(await redeemReferralCode(req.firebaseUser.uid, code)));
  } catch (err) {
    next(err);
  }
});
