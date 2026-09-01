import { Router, type Request, type Response, type NextFunction } from 'express';

import {
  RegisterRequestSchema,
  SaveChildrenSchema,
  SendEmailOtpSchema,
  SetVerifiedEmailSchema,
  SubmitIdRequestSchema,
  UpdateProfileRequestSchema,
  VerifyEmailOtpSchema,
} from '@nanny-app/shared';

import { optionalAuth, requireAuth } from '@backend/middleware/auth.middleware';
import { validateBody } from '@backend/middleware/validate.middleware';
import { ok } from '@backend/lib/api-response';
import { errors } from '@backend/lib/errors';
import {
  registerUser,
  getMe,
  getMyChildren,
  saveMyChildren,
  setVerifiedEmail,
  submitId,
  updateProfile,
} from '@backend/services/auth.service';
import {
  sendEmailOtp,
  verifyEmailOtp,
} from '@backend/services/email-verification.service';

export const authRouter = Router();

/**
 * POST /auth/register
 * Called once at the end of the mobile registration wizard, after the
 * Firebase account has been created and the phone number linked.
 * Idempotent — safe to retry.
 */
authRouter.post(
  '/register',
  requireAuth,
  validateBody(RegisterRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const user = await registerUser(req.firebaseUser, req.body);
      res.status(201).json(ok(user));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/email/otp
 * Mails a one-time code to the address given. Auth is optional because a nanny
 * verifies her address mid-registration, before the Firebase account she will
 * sign in with exists. When a token *is* present the caller is identified, so
 * "this address is already taken" can correctly ignore their own row — which
 * is what lets someone re-verify an address they already hold. Abuse control
 * is per-address, inside the service.
 */
authRouter.post(
  '/email/otp',
  optionalAuth,
  validateBody(SendEmailOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sendEmailOtp({ email: req.body.email, decoded: req.firebaseUser ?? null });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/email/verify
 * Swaps a correct code for a short-lived, single-use token. Public for the
 * same reason as the send above. The token is then spent by POST /auth/register
 * (nanny) or POST /auth/email (mother) — nothing is marked verified here.
 */
authRouter.post(
  '/email/verify',
  validateBody(VerifyEmailOtpSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(ok(await verifyEmailOtp(req.body.email, req.body.code)));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/email
 * Attaches a proven address to the signed-in user, spending the token from
 * /auth/email/verify. This is how a mother — who registered with a
 * phone-derived placeholder — gets a real, verified email before booking.
 */
authRouter.post(
  '/email',
  requireAuth,
  validateBody(SetVerifiedEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await setVerifiedEmail(req.firebaseUser, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /auth/me
 * Returns the application User row for the current Firebase user. The
 * mobile client calls this on app launch / sign-in to hydrate its profile
 * store. A 404 means the Firebase user exists but the registration wizard
 * never finished — the client should send the user back to /auth/register.
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    const user = await getMe(req.firebaseUser);
    res.json(ok(user));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/id
 * A user (re)submits their identity document outside of registration: a nanny
 * re-uploading after a reject, or a mother uploading before her first booking.
 * Moves the account to PENDING_REVIEW for admin KYC.
 */
authRouter.post(
  '/id',
  requireAuth,
  validateBody(SubmitIdRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const user = await submitId(req.firebaseUser, req.body);
      res.json(ok(user));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /auth/children
 * The mother's saved children, used to prefill the booking sheet.
 */
authRouter.get('/children', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.firebaseUser) throw errors.unauthorized();
    res.json(ok(await getMyChildren(req.firebaseUser)));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /auth/children
 * Replaces the mother's saved children with the set sent. PUT rather than POST
 * because the body is the complete new state, not an addition — which is what
 * the booking sheet's "save for next booking" toggle means.
 */
authRouter.put(
  '/children',
  requireAuth,
  validateBody(SaveChildrenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      res.json(ok(await saveMyChildren(req.firebaseUser, req.body)));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /auth/me
 * Updates profile fields for the current user (name, phone, avatar URL).
 */
authRouter.patch(
  '/me',
  requireAuth,
  validateBody(UpdateProfileRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.firebaseUser) throw errors.unauthorized();
      const user = await updateProfile(req.firebaseUser, req.body);
      res.json(ok(user));
    } catch (err) {
      next(err);
    }
  },
);
